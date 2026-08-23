import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * BLOG 分层 P3-FIX1:只读模式 403 端点。
 *
 * - Next 13.0.6 middleware 禁止修改 response body,只读拦截改为
 *   redirect 到本端点,由本端点返回最终 403 JSON。
 * - 任何方法、任何请求一律 403(重定向默认 307 保留 method;
 *   fetch 默认跟随 redirect 后拿到此 JSON)。
 * - 该端点本身不在 middleware matcher 内,不会形成循环重定向。
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(403).json({
    error: 'READ_ONLY',
    message: '站点处于只读状态,编辑/上传/发布暂不可用,请稍后再试或升级专业版',
  })
}
