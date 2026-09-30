import {
  clearFriendsDbCache,
  deleteFriendById,
  listFriends,
  upsertFriend,
} from '@/src/lib/admin/friendsNotion'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

export default async function handler(req, res) {
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  try {
    if (req.method === 'GET') {
      const { friends } = await listFriends()
      return res.status(200).json({ success: true, friends, source: 'notion' })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
      const result = await upsertFriend(body, {
        id: body.id ? String(body.id) : undefined,
        upsert: Boolean(body.upsert),
      })
      return res.status(200).json(result)
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      const result = await deleteFriendById(Array.isArray(id) ? id[0] : id)
      return res.status(200).json(result)
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    clearFriendsDbCache()
    console.error('Friends API Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
