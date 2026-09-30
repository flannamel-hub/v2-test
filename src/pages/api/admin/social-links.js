import {
  clearSocialLinksDbCache,
  listSocialLinks,
  saveSocialLinks,
} from '@/src/lib/admin/socialLinksNotion'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

export default async function handler(req, res) {
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  try {
    if (req.method === 'GET') {
      const data = await listSocialLinks()
      return res.status(200).json({ success: true, ...data, source: 'notion' })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
      const data = await saveSocialLinks({
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        links: Array.isArray(body.links) ? body.links : [],
      })
      return res.status(200).json({ success: true, ...data, source: 'notion' })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    clearSocialLinksDbCache()
    console.error('Social Links API Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

