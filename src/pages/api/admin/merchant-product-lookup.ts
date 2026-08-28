import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { fetchMerchantProductBySku, type MerchantProduct } from '@/src/lib/shop/merchantProducts'

/**
 * P18C45FIX B2:Step7「添加商品信息」弹窗的商品码查询代理。
 *
 * 仅 BLOG 后台浏览器调用(verifyAdminRequest 鉴权)。
 * GET ?sku=xxx → 服务端经 fetchMerchantProductBySku 查主站
 * (MERCHANT_API_BASE + MERCHANT_PRODUCTS_PATH?sku=,8s 超时;
 * Bearer MERCHANT_API_TOKEN 仅服务端使用,绝不回传浏览器)。
 * 返回 { success, available, product: {sku,name,price,status}|null, error? }:
 * - available=true + product 非空:查到(含已下架,status 原样返回由前端判定);
 * - available=true + product=null:主站可达但未找到该 sku;
 * - available=false:主站不可达/未配置/超时(error 附原因)。
 */

type MerchantProductLookupResponse = {
  success: boolean
  available: boolean
  product: MerchantProduct | null
  source?: string
  error?: string
}

function fail(
  res: NextApiResponse<MerchantProductLookupResponse>,
  status: number,
  error: string
) {
  return res.status(status).json({ success: false, available: false, product: null, error })
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MerchantProductLookupResponse>
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return fail(res, 405, 'Method not allowed')
  }

  if (!verifyAdminRequest(req)) {
    return fail(res, 401, '未授权')
  }

  const rawSku = Array.isArray(req.query.sku) ? req.query.sku[0] : req.query.sku
  const sku = String(rawSku || '').trim()
  if (!sku) {
    return fail(res, 400, '商品码为空,无法查询系统商品')
  }

  const result = await fetchMerchantProductBySku(sku)
  return res.status(200).json({
    success: true,
    available: result.available,
    product: result.product,
    ...(result.source ? { source: result.source } : {}),
    ...(result.error ? { error: result.error } : {}),
  })
}
