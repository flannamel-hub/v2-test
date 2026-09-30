import {
  clearFriendsDbCache,
  upsertFriend,
} from '@/src/lib/admin/friendsNotion'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

export const config = {
  maxDuration: 300,
}

export default async function handler(req, res) {
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const friends = Array.isArray(body.friends) ? body.friends : []
    if (!friends.length) {
      return res.status(400).json({ success: false, error: 'friends 不能为空' })
    }

    const results = []
    for (const friend of friends) {
      try {
        results.push(
          await upsertFriend(friend, {
            upsert: Boolean(body.upsert),
          })
        )
      } catch (error) {
        results.push({
          success: false,
          action: 'failed',
          url: friend?.url || '',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return res.status(200).json({
      success: results.every((item) => item.success !== false),
      results,
    })
  } catch (error) {
    clearFriendsDbCache()
    console.error('Friends batch API Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
