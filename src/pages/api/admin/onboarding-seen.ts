import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

/**
 * R16:BLOG 后台新手聚焦引导「已看过」回调(2B:用户真正看到并关闭引导后才写标记)。
 *
 * 仅 BLOG 后台浏览器调用(verifyAdminRequest 鉴权)。
 * POST → 服务端回调主站 /api/merchant/blog-tour-seen(Bearer MERCHANT_API_TOKEN
 * 仅服务端使用,绝不回传浏览器/落日志),body {site_id: BLOG_SITE_ID},8s 超时。
 * best-effort 语义:未配置 BLOG_SITE_ID → 200 {ok:true,skipped:true};
 * 上游非 2xx/异常 → 200 {ok:false,error}(前端 fire-and-forget,忽略结果)。
 *
 * R18(§八-5):body 可选 kind:'home' | 'editor'(缺省按 'home',向后兼容)→ 透传主站
 * 同名参数,主站按 kind 写对应列(editor → blog_editor_tour_seen_at)。
 */

type OnboardingSeenResponse = {
  ok: boolean
  skipped?: boolean
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OnboardingSeenResponse>
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ ok: false, error: '未授权' })
  }

  const siteId = (process.env.BLOG_SITE_ID || '').trim()
  if (!siteId) {
    return res.status(200).json({ ok: true, skipped: true })
  }

  // R18:kind 透传(仅接受 'editor',其余一律按 'home',与主站缺省语义一致)
  const kind = req.body?.kind === 'editor' ? 'editor' : 'home'

  const base =
    (process.env.MERCHANT_API_BASE || '').trim().replace(/\/+$/, '') ||
    'https://creator.proplus.onl'
  const token = (process.env.MERCHANT_API_TOKEN || '').trim()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const upstream = await fetch(`${base}/api/merchant/blog-tour-seen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ site_id: siteId, kind }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))

    if (!upstream.ok) {
      return res
        .status(200)
        .json({ ok: false, error: `主站接口返回 HTTP ${upstream.status}` })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(200).json({
      ok: false,
      error: error instanceof Error ? error.message : '回调主站失败',
    })
  }
}
