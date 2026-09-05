import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * 派工单 B4:IndexNow key 文件端点。
 *
 * - 由 next.config.js rewrites 把 `/{key}.txt`(afterFiles 阶段,晚于文件系统路由)
 *   转发到本端点;robots.txt / sitemap.xml 等真实路由不会被拦截(详见 next.config.js 注释)。
 * - 规则:GET 请求且 `req.query.key === process.env.INDEXNOW_KEY`(env 已配置)时
 *   返回 200 text/plain,body 恰为 key 值(IndexNow 规范要求原文一致);
 *   key 不符 / 未配置 INDEXNOW_KEY → 404。不输出任何额外敏感信息。
 */

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('Method not allowed')
  }

  const expected = process.env.INDEXNOW_KEY?.trim() || ''
  const key = typeof req.query.key === 'string' ? req.query.key : ''

  if (!expected || key !== expected) {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    return res.status(404).send('Not Found')
  }

  res.setHeader('content-type', 'text/plain; charset=utf-8')
  return res.status(200).send(expected)
}
