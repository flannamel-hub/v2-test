import type { NextApiRequest, NextApiResponse } from 'next'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'
import {
  getMembershipConfig,
  getEffectiveMembershipConfig,
  type SiteMembershipCopy,
  type SiteMembershipCopyFaqItem,
} from '@/src/lib/blog/membershipGate'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { normalizePricingCardStyle } from '@/src/lib/blog/pricingCardStyles'
import { enqueueRevalidatePaths } from '@/src/lib/blog/revalidateQueue'

/**
 * 站点会员 R2-B5b W2:「会员说明页」文案读写端点(仅 BLOG 后台浏览器调用)。
 * - GET:读 membership 配置,返回 copy + plans(只读区数据)+ plan/enabled 门控态;
 * - POST:仅允许编辑 copy 五字段(intro/benefits/guarantee/faq/cardStyle),服务端 sanitize 后
 *   读-改-写 merge 回 membership(保留 enabled/plans 原值不动;绝不接受/透传这两字段);
 * - 竞态缓解三件套(§10.3):模块级单飞串行(in-flight 写入排队,不与在途写交错)+
 *   写前紧邻重读 + 写后 updatedAt 对账回读;残余跨进程窗口=接受并记录(零 SQL 无法原子化);
 * - 写入成功后调用站点 revalidate 队列刷新 /pricing(失败 warn-only);
 * - 路由内鉴权(middleware matcher 不等于鉴权——AGENTS §21 约定)。
 */

const TABLE = 'blog_site_settings'
const COPY_INTRO_MAX = 500
const COPY_BENEFIT_MAX_ITEMS = 8
const COPY_BENEFIT_ITEM_MAX = 120
const COPY_GUARANTEE_MAX = 300
const COPY_FAQ_MAX_ITEMS = 8
const COPY_FAQ_Q_MAX = 80
const COPY_FAQ_A_MAX = 300

type PricingCopyPostBody = {
  intro?: unknown
  benefits?: unknown
  guarantee?: unknown
  faq?: unknown
  cardStyle?: unknown
}

type SanitizedCopy = Pick<
  SiteMembershipCopy,
  'intro' | 'benefits' | 'guarantee' | 'faq' | 'cardStyle'
>

/** 字段级 sanitize:非字符串/空白 → undefined;超长截断(与 membershipGate 读侧口径一致) */
function sanitizeCopyField(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

function sanitizeBenefits(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const benefits = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, COPY_BENEFIT_ITEM_MAX))
    .filter((item) => item.length > 0)
    .slice(0, COPY_BENEFIT_MAX_ITEMS)
  return benefits.length > 0 ? benefits : undefined
}

function sanitizeFaq(value: unknown): SiteMembershipCopyFaqItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const faq = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      q: typeof item.q === 'string' ? item.q.trim().slice(0, COPY_FAQ_Q_MAX) : '',
      a: typeof item.a === 'string' ? item.a.trim().slice(0, COPY_FAQ_A_MAX) : '',
    }))
    .filter((item) => item.q.length > 0 && item.a.length > 0)
    .slice(0, COPY_FAQ_MAX_ITEMS)
  return faq.length > 0 ? faq : undefined
}

/** 全字段 sanitize;全部缺失/无效 → null(恢复默认文案) */
function sanitizeCopy(body: PricingCopyPostBody): SanitizedCopy | null {
  const out: SanitizedCopy = {}
  const intro = sanitizeCopyField(body.intro, COPY_INTRO_MAX)
  if (intro !== undefined) out.intro = intro
  const benefits = sanitizeBenefits(body.benefits)
  if (benefits !== undefined) out.benefits = benefits
  const guarantee = sanitizeCopyField(body.guarantee, COPY_GUARANTEE_MAX)
  if (guarantee !== undefined) out.guarantee = guarantee
  const faq = sanitizeFaq(body.faq)
  if (faq !== undefined) out.faq = faq
  // R13:等级卡样式(仅三值;'default'/非法 → 不写字段)
  const cardStyle = normalizePricingCardStyle(body.cardStyle)
  if (cardStyle !== undefined) out.cardStyle = cardStyle
  if (Object.keys(out).length === 0) return null
  return out
}

type WriteOutcome = {
  ok: boolean
  copy: SiteMembershipCopy | null
  error?: string
}

/** 模块级单飞:同一进程内并发 POST 排队串行(在途写完成后才进入下一段读-改-写) */
let inflightWrite: Promise<WriteOutcome> | null = null

async function mergeWriteCopy(
  sanitized: SanitizedCopy | null
): Promise<WriteOutcome> {
  // 单飞合并:已有在途写入时先等它落定,再进入本次写入(不与在途读-改-写交错)
  if (inflightWrite) {
    await inflightWrite.catch(() => undefined)
  }

  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return { ok: false, copy: null, error: '站点配置不可用' }
  }

  const now = new Date().toISOString()
  const nextCopy: SiteMembershipCopy | null = sanitized
    ? { ...sanitized, updatedAt: now }
    : null

  const run = (async (): Promise<WriteOutcome> => {
    try {
      // 写前紧邻重读:以最新行 merge,尽量保住平台侧刚写入的 enabled/plans
      const { data, error } = await supabase
        .from(TABLE)
        .select('membership')
        .eq('site_id', siteId)
        .maybeSingle()
      if (error) {
        return { ok: false, copy: null, error: '保存失败，请稍后重试' }
      }
      const current =
        data && typeof (data as { membership?: unknown }).membership === 'object' &&
        (data as { membership?: unknown }).membership !== null &&
        !Array.isArray((data as { membership?: unknown }).membership)
          ? ((data as { membership?: Record<string, unknown> }).membership as Record<string, unknown>)
          : {}
      const nextMembership = { ...current, copy: nextCopy }

      const { error: updateError } = await supabase
        .from(TABLE)
        .update({ membership: nextMembership, updated_at: now })
        .eq('site_id', siteId)
      if (updateError) {
        return { ok: false, copy: null, error: '保存失败，请稍后重试' }
      }

      // updatedAt 对账:回读确认 copy.updatedAt 与写入值一致(仅在写入非 null 时;
      // copy=null 恢复默认时回读为 null/undefined,不参与对账);
      // 不一致=并发方(跨进程/平台侧)覆盖了本次写入——warn 记录,残余窗口接受(§10.3)
      if (nextCopy) {
        try {
          const { data: verifyRow } = await supabase
            .from(TABLE)
            .select('membership')
            .eq('site_id', siteId)
            .maybeSingle()
          const readBackUpdatedAt = (verifyRow as {
            membership?: { copy?: { updatedAt?: unknown } }
          } | null)?.membership?.copy?.updatedAt
          if (readBackUpdatedAt !== now) {
            console.warn(
              '[pricing-copy] updatedAt 对账不一致(疑似并发覆盖,以库内最新值为准)'
            )
          }
        } catch {
          // 对账读失败不影响写结果
        }
      }

      return { ok: true, copy: nextCopy }
    } catch (e) {
      console.warn(
        '[pricing-copy] merge write failed:',
        e instanceof Error ? e.message : e
      )
      return { ok: false, copy: null, error: '保存失败，请稍后重试' }
    }
  })()

  inflightWrite = run
  try {
    return await run
  } finally {
    if (inflightWrite === run) inflightWrite = null
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  try {
    if (req.method === 'GET') {
      const [quotaState, config] = await Promise.all([
        getSiteQuotaState(),
        getMembershipConfig(),
      ])
      return res.status(200).json({
        success: true,
        copy: config?.copy ?? null,
        plans: config?.plans ?? [],
        plan: quotaState.plan,
        enabled: !!config,
      })
    }

    if (req.method === 'POST') {
      // 双门:plan==='pro' && membership.enabled===true(R2-B5b R2 口径统一)
      const effective = await getEffectiveMembershipConfig()
      if (!effective) {
        return res
          .status(403)
          .json({ success: false, error: '站点会员未开通或非专业版，无法编辑会员说明文案' })
      }

      const body: PricingCopyPostBody =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      // 安全:绝不接受/透传 enabled/plans 字段(body 只取四字段,其余忽略)
      const sanitized = sanitizeCopy(body)

      const outcome = await mergeWriteCopy(sanitized)
      if (!outcome.ok) {
        return res.status(500).json({ success: false, error: outcome.error })
      }

      // 站点刷新入队(失败 warn-only,不阻断保存回执)
      try {
        await enqueueRevalidatePaths(['/pricing'], {
          scope: 'pricing-copy',
          reason: 'pricing-copy',
        })
      } catch (rvErr) {
        console.warn('[pricing-copy] revalidate enqueue failed:', rvErr)
      }

      return res.status(200).json({ success: true, copy: outcome.copy })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
