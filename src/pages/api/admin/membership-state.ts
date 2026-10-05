import type { NextApiRequest, NextApiResponse } from 'next'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'
import { getMembershipConfig } from '@/src/lib/blog/membershipGate'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

const SETTINGS_TABLE = 'blog_site_settings'

/** 站点会员 B3:编辑器 member 块门控只读端点。
 * 仅 BLOG 后台浏览器(编辑器门控)调用;不含 plans/copy 明细。
 * enabled = 原始读(平台是否已为该站开通站点会员,不含 plan 双门;fail-closed);
 * 前端 canAdd 判定 = plan==='pro' && enabled===true。
 * R2-B5b W3:响应扩展 vending(贩售模式镜像态,供编辑器灰态文案/会员说明页面板门控)。
 * 路由内鉴权(middleware matcher 不等于鉴权——AGENTS §21 约定)。 */
type MembershipStateResponse = {
  success: boolean
  plan?: 'free' | 'pro'
  enabled?: boolean
  vending?: boolean
  error?: string
}

/**
 * R2-B5b W3:读 blog_site_settings.vending_enabled(legacy 兼容镜像)。
 * - 权威数据源是 Notion vending widget;后台三态保存与平台同步路径都会刷新本镜像列
 *   (vendingSettings.syncLegacyVendingEnabled);
 * - stale 边界(接受并记录):人工直改 Notion widget status 时本列不会随之变化,
 *   本接口按列值返回,可能与前台实际贩售态短暂不一致;
 * - fail-open false:未配置 siteId/Supabase、读取失败、无行、列值非 true → 一律 false。
 */
async function readVendingEnabledMirror(): Promise<boolean> {
  try {
    const siteId = getBlogSiteIdOrNull()
    const supabase = getSupabaseAdmin()
    if (!siteId || !supabase) return false
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('vending_enabled')
      .eq('site_id', siteId)
      .maybeSingle()
    if (error || !data) return false
    return data.vending_enabled === true
  } catch {
    return false
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MembershipStateResponse>
) {
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    const [quotaState, config, vending] = await Promise.all([
      getSiteQuotaState(),
      getMembershipConfig(),
      readVendingEnabledMirror(),
    ])
    return res.status(200).json({
      success: true,
      plan: quotaState.plan,
      enabled: !!config,
      vending,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
