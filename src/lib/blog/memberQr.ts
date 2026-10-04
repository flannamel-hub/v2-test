/**
 * 站点会员 B4-W1:登录弹窗二维码图片解码(仅上传图片,不做相机实时扫)。
 * - 文件护栏:image/* 且 ≤8MB,失败归独立错误 bad_file(与 decode_failed 分开映射);
 * - 解码链:原生 BarcodeDetector(formats:['qr_code'])优先,失败/抛错/不可用 →
 *   jsQR 降级(动态 import('jsqr'),动态分包硬要求:全仓仅本文件引用 jsqr 且仅 import() 内);
 * - jsQR canvas 流程:bitmap → canvas 2D → getImageData → jsQR(data, w, h);
 *   大图先等比缩至 ≤1600px 边(主线程保护);
 * - createImageBitmap 缺失(旧 Safari)→ Image + URL.createObjectURL 兜底,再失败归 decode_failed;
 * - 解码返回原始文本,调用侧再 normalizeMemberAccessKey 规范化。
 * 依赖注入:getDetector/loadJsQr 可注入(node --test 无 window/canvas,伪 DETECTOR 模拟)。
 */

export type MemberQrDecodeResult =
  | { ok: true; text: string }
  | { ok: false; error: 'bad_file' | 'decode_failed' }

/** 文件上限 8MB(建议值,派工单 §3-W1) */
export const MEMBER_QR_MAX_FILE_BYTES = 8 * 1024 * 1024

/** jsQR 解码前等比缩放的最大边长 */
export const MEMBER_QR_MAX_EDGE_PX = 1600

/** jsQR 函数形状(CJS default 导出) */
export type MemberQrJsQrFunction = (
  data: Uint8ClampedArray,
  width: number,
  height: number
) => ({ data: string } | null)

/** 原生 BarcodeDetector 的本地最小 interface(TS4.9 DOM lib 无此类型) */
export interface MemberQrBarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>
}

/** 纯文件护栏:image/* 且大小不超限 */
export function validateMemberQrFile(file: {
  type?: string
  size?: number
}): boolean {
  const type = (file?.type || '').toLowerCase()
  if (!type.startsWith('image/')) return false
  const size = typeof file?.size === 'number' ? file.size : -1
  if (size < 0 || size > MEMBER_QR_MAX_FILE_BYTES) return false
  return true
}

/** 纯缩放计算:返回 1 或等比缩至 ≤maxEdge 的比例(0 < scale ≤ 1) */
export function pickMemberQrScale(
  width: number,
  height: number,
  maxEdge: number = MEMBER_QR_MAX_EDGE_PX
): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 1
  }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return 1
  return maxEdge / longest
}

type MemberQrPixels = {
  data: Uint8ClampedArray
  width: number
  height: number
}

type MemberQrChainDeps = {
  getDetector?: () => MemberQrBarcodeDetectorLike | null
  loadJsQr?: () => Promise<MemberQrJsQrFunction | null>
}

/** 默认探测器:window 上有 BarcodeDetector 才可用(node/旧浏览器 → null) */
function resolveDefaultQrDetector(): MemberQrBarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    BarcodeDetector?: new (options: {
      formats: string[]
    }) => MemberQrBarcodeDetectorLike
  }
  if (typeof w.BarcodeDetector !== 'function') return null
  try {
    return new w.BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/** 默认 jsQR 装载:动态 import(动态分包;仅此一处引用 jsqr) */
async function loadDefaultJsQr(): Promise<MemberQrJsQrFunction | null> {
  try {
    const mod = await import('jsqr')
    const fn = (mod as { default?: unknown }).default
    return typeof fn === 'function'
      ? (fn as MemberQrJsQrFunction)
      : null
  } catch {
    return null
  }
}

/**
 * 降级链核心(可注入):BarcodeDetector 优先 → jsQR 兜底。
 * 任何一级命中非空文本即返回;全败/异常归 decode_failed。
 * detectSource:原生探测器的图像源(真实流程传 canvas;注入测试可省略)。
 */
export async function decodeMemberQrFromPixels(
  pixels: MemberQrPixels,
  deps: MemberQrChainDeps = {},
  detectSource?: CanvasImageSource
): Promise<MemberQrDecodeResult> {
  const detector =
    typeof deps.getDetector === 'function'
      ? deps.getDetector()
      : resolveDefaultQrDetector()
  if (detector) {
    try {
      const source =
        detectSource ??
        ({ width: pixels.width, height: pixels.height } as unknown as CanvasImageSource)
      const found = await detector.detect(source)
      const text = found?.[0]?.rawValue
      if (typeof text === 'string' && text.trim()) {
        return { ok: true, text }
      }
    } catch {
      // 原生探测失败 → 降级 jsQR
    }
  }

  const loadJsQr = deps.loadJsQr ?? loadDefaultJsQr
  const jsQr = await loadJsQr()
  if (!jsQr) return { ok: false, error: 'decode_failed' }
  try {
    const result = jsQr(pixels.data, pixels.width, pixels.height)
    const text = result?.data
    if (typeof text === 'string' && text.trim()) {
      return { ok: true, text }
    }
  } catch {
    // jsQR 抛错 → decode_failed
  }
  return { ok: false, error: 'decode_failed' }
}

type BitmapLike = {
  width: number
  height: number
}

/** bitmap → canvas 2D 像素(等比缩至 ≤1600px;无 canvas 环境返回 null) */
function drawBitmapToPixels(
  bitmap: BitmapLike & CanvasImageSource
): { pixels: MemberQrPixels; canvas: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const scale = pickMemberQrScale(bitmap.width, bitmap.height)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, width, height)
  try {
    const imageData = ctx.getImageData(0, 0, width, height)
    return { pixels: { data: imageData.data, width, height }, canvas }
  } catch {
    return null
  }
}

/** 文件 → 位图:createImageBitmap 优先(EXIF 方向友好),缺失时 Image + objectURL 兜底 */
async function loadFileBitmap(file: File): Promise<BitmapLike & CanvasImageSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // 落入 Image 兜底
    }
  }
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return null
  }
  return await new Promise<BitmapLike & CanvasImageSource | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/** 主入口:上传文件 → 护栏 → 位图 → 像素 → 降级链解码 */
export async function decodeMemberQrFromFile(
  file: File
): Promise<MemberQrDecodeResult> {
  if (!validateMemberQrFile(file)) {
    return { ok: false, error: 'bad_file' }
  }
  const bitmap = await loadFileBitmap(file)
  if (!bitmap || !bitmap.width || !bitmap.height) {
    return { ok: false, error: 'decode_failed' }
  }
  const drawn = drawBitmapToPixels(bitmap)
  if (!drawn) {
    return { ok: false, error: 'decode_failed' }
  }
  return decodeMemberQrFromPixels(drawn.pixels, {}, drawn.canvas)
}
