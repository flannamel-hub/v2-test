/** Vercel Serverless 请求体硬上限约 4.5MB，留余量走代理 */

const PROXY_SAFE_BYTES = 3.5 * 1024 * 1024



/** 直传失败时允许回退代理通道的文件体积上限（超过则回退无意义，直接报错） */

const DIRECT_FALLBACK_SAFE_BYTES = 4 * 1024 * 1024



/** 直传能力客户端缓存（与服务端能力缓存同节奏，失败不缓存） */

const PRESIGN_CAPABILITY_CACHE_MS = 60_000

let presignCapabilityMemo = null



/** 图库 / 图片块：长边上限与目标体积（典型输出约 300–500KB JPEG） */

const GALLERY_MAX_DIM = 1920

const GALLERY_TARGET_BYTES = 480 * 1024

const GALLERY_SKIP_BYTES = 260 * 1024



/** 兰空图床：后台限速 50 张/分钟，客户端留余量走全局队列 */

const LSKY_MAX_PER_MINUTE = 48

const LSKY_RATE_WINDOW_MS = 60_000



const uploadTimestamps = []

let uploadChain = Promise.resolve()



function isLocalDevHost() {

  if (typeof window === 'undefined') return false

  const h = window.location.hostname

  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'

}



function sleep(ms) {

  return new Promise((r) => setTimeout(r, ms))

}



function pruneUploadTimestamps() {

  const cutoff = Date.now() - LSKY_RATE_WINDOW_MS

  while (uploadTimestamps.length && uploadTimestamps[0] < cutoff) {

    uploadTimestamps.shift()

  }

}



function isRateLimitMessage(msg) {

  return /每分钟|最多.*\d+\s*张|上传.*过于频繁|rate\s*limit|too many/i.test(

    msg || ''

  )

}



async function waitForUploadSlot() {

  pruneUploadTimestamps()

  if (uploadTimestamps.length < LSKY_MAX_PER_MINUTE) return



  const oldest = uploadTimestamps[0]

  const waitMs = LSKY_RATE_WINDOW_MS - (Date.now() - oldest) + 300

  if (waitMs > 0) await sleep(waitMs)

  pruneUploadTimestamps()

}



/**

 * 全局串行队列 + 每分钟上限，避免图库与图片块合计触发兰空限速

 */

function enqueueLskyUpload(task) {

  const next = uploadChain.then(async () => {

    await waitForUploadSlot()

    const runTask = async () => {

      const result = await task()

      if (!result) throw new Error('图床未返回图片地址')

      uploadTimestamps.push(Date.now())

      pruneUploadTimestamps()

      return result

    }

    try {

      return await runTask()

    } catch (e) {

      const msg = e?.message || ''

      if (isRateLimitMessage(msg)) {

        await sleep(LSKY_RATE_WINDOW_MS + 500)

        return runTask()

      }

      throw e

    }

  })

  uploadChain = next.catch(() => {})

  return next

}



async function readResponseBody(res) {

  const text = await res.text()

  try {

    const json = JSON.parse(text)

    const msg = json.message || json.error || ''

    if (/csrf/i.test(msg)) {

      throw new Error(

        '图片上传校验失败，请稍后重试。'

      )

    }

    if (isRateLimitMessage(msg)) {

      throw new Error(msg)

    }

    return { json, text }

  } catch (e) {

    if (e.message?.includes('CSRF') || isRateLimitMessage(e.message)) throw e

    if (/request entity too large|payload too large|413|FUNCTION_PAYLOAD/i.test(text)) {

      const err = new Error('VERCEL_PAYLOAD_TOO_LARGE')

      err.raw = text

      throw err

    }

    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)

  }

}



// ============================================================

// W4-5a 保格式压缩：动图字节级判定 / WebP 编码能力探测 / 输出格式决策

// （权威依据 MERCHANT_STORAGE_W4_5_COMPRESS_DESIGN.md §9）

// ============================================================

/** 体积护栏（§9.2-4）：产物超过原文件 × 1.05 才回退用原文件 */

export function shouldUseOriginal(producedBytes, originalBytes) {

  return Number(producedBytes) > Number(originalBytes) * 1.05

}



/**
 * GIF 动图判定（§9.2-3）：结构化遍历块引入符——0x21 扩展块按 sub-block 链跳过、
 * 0x2C 图像描述符计数、0x3B 终止。图像描述符 ≥2 → 动图。
 * 禁止裸扫 0x2C（LZW 数据流内 0x2C 遍地，必误判）。
 * NETSCAPE2.0 应用扩展仅作佐证、不作为判据（静图含该扩展不得误判）。
 */

export function isAnimatedGif(bytes) {

  if (!bytes || bytes.length < 14) return false

  if (!(bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)) return false

  if (!(bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61)) {

    return false

  }

  let i = 6 + 7

  const screenPacked = bytes[10]

  if (screenPacked & 0x80) {

    i += 3 * (1 << ((screenPacked & 0x07) + 1))

  }

  const limit = bytes.length

  let descriptors = 0

  while (i < limit) {

    const introducer = bytes[i]

    if (introducer === 0x3b) break

    if (introducer === 0x21) {

      i += 2

      while (i < limit) {

        const len = bytes[i]

        i += 1

        if (len === 0) break

        i += len

      }

      continue

    }

    if (introducer === 0x2c) {

      descriptors += 1

      if (descriptors >= 2) return true

      i += 1

      if (i + 9 > limit) break

      const localPacked = bytes[i + 8]

      i += 9

      if (localPacked & 0x80) {

        i += 3 * (1 << ((localPacked & 0x07) + 1))

      }

      i += 1

      while (i < limit) {

        const len = bytes[i]

        i += 1

        if (len === 0) break

        i += len

      }

      continue

    }

    break

  }

  return descriptors >= 2

}



/** 动画 WebP 判定（§9.2-6）：RIFF+WEBP 头，VP8X 与 ANMF 同时存在 → 动画 */

export function isAnimatedWebp(bytes) {

  if (!bytes || bytes.length < 12) return false

  if (!(bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)) {

    return false

  }

  if (!(bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)) {

    return false

  }

  let i = 12

  const limit = bytes.length

  let sawVp8x = false

  let sawAnmf = false

  while (i + 8 <= limit) {

    const fourCC = String.fromCharCode(

      bytes[i],

      bytes[i + 1],

      bytes[i + 2],

      bytes[i + 3]

    )

    const size =

      bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24)

    if (fourCC === 'VP8X') sawVp8x = true

    if (fourCC === 'ANMF') sawAnmf = true

    if (sawVp8x && sawAnmf) return true

    i += 8 + size + (size & 1)

  }

  return false

}



/**
 * 输出格式决策（§3.1）：JPEG 保持 JPEG；PNG/WebP/静图 GIF 优先 WebP；
 * 老引擎（无 WebP 编码）回退 PNG（仅降尺寸）；动图原格式原样返回。
 * 未知图片类型返回 null，由调用方维持既有 JPEG 行为。
 */

export function pickOutputFormat(inputMime, opts = {}) {

  const mime = String(inputMime || '').toLowerCase()

  const webpEncodable = opts.webpEncodable === true

  if (opts.animated) {

    if (mime === 'image/gif') return { mime: 'image/gif', ext: '.gif' }

    if (mime === 'image/webp') return { mime: 'image/webp', ext: '.webp' }

  }

  if (mime === 'image/jpeg') return { mime: 'image/jpeg', ext: '.jpg' }

  if (mime === 'image/webp' || mime === 'image/png' || mime === 'image/gif') {

    return webpEncodable

      ? { mime: 'image/webp', ext: '.webp' }

      : { mime: 'image/png', ext: '.png' }

  }

  return null

}



/** 动图判定读取窗口（§9.2-3）：≤1MB 全量读；>1MB 读前 512KB；读取失败按静图处理 */

async function readImageHeadBytes(file) {

  try {

    if (file.size <= 1024 * 1024) {

      return new Uint8Array(await file.arrayBuffer())

    }

    const head = await file.slice(0, 512 * 1024).arrayBuffer()

    return new Uint8Array(head)

  } catch {

    return new Uint8Array(0)

  }

}



async function isAnimatedImageFile(file) {

  const mime = String((file && file.type) || '').toLowerCase()

  if (mime !== 'image/gif' && mime !== 'image/webp') return false

  const head = await readImageHeadBytes(file)

  return mime === 'image/gif' ? isAnimatedGif(head) : isAnimatedWebp(head)

}



/**
 * WebP 编码能力探测（§9.1-1）：判据必须是 blob.type === 'image/webp'——
 * 不支持的引擎不返回 null，而是静默回退编码为 PNG；探测异常按不支持处理；
 * 结果进程内缓存（只探一次）。
 */

let webpEncodeMemo = null

async function detectWebpEncodeSupport() {

  if (webpEncodeMemo != null) return webpEncodeMemo

  try {

    const canvas = document.createElement('canvas')

    canvas.width = 1

    canvas.height = 1

    const blob = await new Promise((resolve) => {

      canvas.toBlob(resolve, 'image/webp', 0.8)

    })

    webpEncodeMemo = !!(blob && blob.type === 'image/webp')

  } catch {

    webpEncodeMemo = false

  }

  return webpEncodeMemo

}



/** 测试辅助：清空 WebP 编码能力缓存 */

export function __resetWebpEncodeCacheForTest() {

  webpEncodeMemo = null

}



function extForMime(mime) {

  if (mime === 'image/webp') return '.webp'

  if (mime === 'image/png') return '.png'

  if (mime === 'image/gif') return '.gif'

  return '.jpg'

}



async function loadImageFromFile(file) {

  // W4-5a 方向加固（§3.2）：首选 createImageBitmap 显式按 EXIF 方向解码，
  // 失败回退 new Image()（现代引擎渲染时已按方向绘制）；两者都失败抛「无法读取图片」

  if (typeof createImageBitmap === 'function') {

    try {

      return await createImageBitmap(file, { imageOrientation: 'from-image' })

    } catch {

      /* 回退下方 Image 路径 */

    }

  }

  const objectUrl = URL.createObjectURL(file)

  try {

    return await new Promise((resolve, reject) => {

      const el = new Image()

      el.onload = () => resolve(el)

      el.onerror = () => reject(new Error('无法读取图片'))

      el.src = objectUrl

    })

  } finally {

    URL.revokeObjectURL(objectUrl)

  }

}

async function compressImageFile(

  file,

  { maxBytes, maxDim, minQuality = 0.42 }

) {

  if (file.size <= maxBytes) return file



  const mime = file.type || ''



  if (!/^image\//i.test(mime)) {

    throw new Error(

      `文件约 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过单张限制，请先压缩后再上传`

    )

  }



  // W4-5a（§9.2-9）：动图（GIF/动画 WebP）字节级判定提前到解码前——原样返回，不解码不重绘

  if (await isAnimatedImageFile(file)) {

    return file

  }



  // W4-5a：输出格式决策——JPEG 输入保持既有 JPEG 路径（阶梯/目标/抛错逐字不变）；
  // PNG/WebP/静图 GIF 走 WebP 新路径；老引擎回退 PNG；未知类型维持既有 JPEG 行为

  const webpEncodable = await detectWebpEncodeSupport()

  const format = pickOutputFormat(mime, { webpEncodable })

  if (!format || format.mime === 'image/jpeg') {

    return compressImageAsJpeg(file, { maxBytes, maxDim, minQuality })

  }

  return compressImageWithModernFormat(file, { maxBytes, maxDim, minQuality }, format)

}



/** JPEG 压缩路径：W4-5a 前的既有实现，阶梯/目标/抛错行为逐字保留（2A 拍板：压缩参数不动） */

async function compressImageAsJpeg(

  file,

  { maxBytes, maxDim, minQuality = 0.42 }

) {

  const img = await loadImageFromFile(file)



  let width = img.naturalWidth || img.width

  let height = img.naturalHeight || img.height

  let dimCap = maxDim



  const canvas = document.createElement('canvas')

  const ctx = canvas.getContext('2d')

  if (!ctx) throw new Error('浏览器无法处理图片压缩')



  let quality = file.size > maxBytes * 3 ? 0.58 : file.size > maxBytes * 1.5 ? 0.72 : 0.85

  let blob = null



  for (let attempt = 0; attempt < 12; attempt++) {

    let w = width

    let h = height

    if (w > dimCap || h > dimCap) {

      const ratio = Math.min(dimCap / w, dimCap / h)

      w = Math.round(w * ratio)

      h = Math.round(h * ratio)

    }



    canvas.width = w

    canvas.height = h

    ctx.drawImage(img, 0, 0, w, h)



    blob = await new Promise((resolve) => {

      canvas.toBlob(resolve, 'image/jpeg', quality)

    })



    if (blob && blob.size <= maxBytes) break



    if (quality > minQuality) {

      quality -= 0.07

    } else {

      width = Math.round(w * 0.84)

      height = Math.round(h * 0.84)

      dimCap = Math.max(width, height)

      quality = 0.8

    }

  }



  if (!blob || blob.size > maxBytes) {

    throw new Error('图片过大，自动压缩后仍超过限制，请手动压缩后再试')

  }



  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')

  return new File([blob], `${baseName}.jpg`, {

    type: 'image/jpeg',

    lastModified: file.lastModified,

  })

}



/**
 * WebP/PNG 新格式路径（§9.2-5）：压不到目标体积返回最小产物、不抛错（JPEG 路径仍抛错）；
 * 产物体积护栏 shouldUseOriginal 命中回退原文件；
 * 产物 Blob type 与扩展名一律跟随实际编码结果（§9.1-1：引擎可能静默把 WebP 编成 PNG）。
 */

async function compressImageWithModernFormat(

  file,

  { maxBytes, maxDim, minQuality = 0.42 },

  format

) {

  const img = await loadImageFromFile(file)



  let width = img.naturalWidth || img.width

  let height = img.naturalHeight || img.height

  let dimCap = maxDim



  const canvas = document.createElement('canvas')

  const ctx = canvas.getContext('2d')

  if (!ctx) throw new Error('浏览器无法处理图片压缩')



  const pngMode = format.mime === 'image/png'

  let quality = file.size > maxBytes * 3 ? 0.58 : file.size > maxBytes * 1.5 ? 0.72 : 0.85

  let smallest = null

  let hit = null



  for (let attempt = 0; attempt < 12; attempt++) {

    let w = width

    let h = height

    if (w > dimCap || h > dimCap) {

      const ratio = Math.min(dimCap / w, dimCap / h)

      w = Math.round(w * ratio)

      h = Math.round(h * ratio)

    }



    canvas.width = w

    canvas.height = h

    ctx.drawImage(img, 0, 0, w, h)



    const blob = await new Promise((resolve) => {

      canvas.toBlob(resolve, format.mime, quality)

    })



    if (blob) {

      const actualType = blob.type || format.mime

      if (!smallest || blob.size < smallest.blob.size) {

        smallest = { blob, type: actualType }

      }

      if (blob.size <= maxBytes) {

        hit = { blob, type: actualType }

        break

      }

      // 引擎静默回退（请求 WebP 实得 PNG）时质量阶梯无意义，直接以当前产物收尾

      if (actualType !== format.mime) break

    }



    if (!pngMode && quality > minQuality) {

      quality -= 0.07

    } else {

      width = Math.round(w * 0.84)

      height = Math.round(h * 0.84)

      dimCap = Math.max(width, height)

      quality = 0.8

    }

  }



  const chosen = hit || smallest

  if (!chosen || shouldUseOriginal(chosen.blob.size, file.size)) {

    return file

  }



  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')

  return new File([chosen.blob], `${baseName}${extForMime(chosen.type)}`, {

    type: chosen.type,

    lastModified: file.lastModified,

  })

}



/** 图库 / 图片块共用压缩（兰空 API 不会自动压缩） */

export async function compressImageForGallery(file, opts = {}) {

  if (!file || !/^image\//i.test(file.type || '')) return file



  // W4-5a（§9.2-9）：动图判定提前到解码之前——动图不解码直接原样返回；
  // 无直传能力且 >3.5MB 时明确报错（§9.2-2），不再静默压成静态图

  if (await isAnimatedImageFile(file)) {

    if (opts.directAvailable !== true && !isLocalDevHost() && file.size > PROXY_SAFE_BYTES) {

      throw new Error('动图文件过大（超过 3.5MB），请压缩后再上传')

    }

    return file

  }



  const img = await loadImageFromFile(file)

  const maxSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)

  if (file.size <= GALLERY_SKIP_BYTES && maxSide <= GALLERY_MAX_DIM) {

    return file

  }



  const compressed = await compressImageFile(file, {

    maxBytes: GALLERY_TARGET_BYTES,

    maxDim: GALLERY_MAX_DIM,

    minQuality: 0.38,

  })



  // W4-5a（§9.1-3）：3.5MB 硬压条件化——仅回退代理路径需要（直传上限 20MB 由主站把关）；
  // 动图已在上方豁免（原样返回或报错）

  if (opts.directAvailable !== true && !isLocalDevHost() && compressed.size > PROXY_SAFE_BYTES) {

    return compressImageFile(compressed, {

      maxBytes: PROXY_SAFE_BYTES,

      maxDim: GALLERY_MAX_DIM,

      minQuality: 0.45,

    })

  }



  return compressed

}

async function uploadViaProxy(file) {

  const res = await fetch('/api/admin/upload', {

    method: 'POST',

    headers: {

      'content-type': file.type || 'application/octet-stream',

      'x-file-name': encodeURIComponent(file.name || 'image.png'),

    },

    body: file,

    credentials: 'same-origin',

  })

  const { json } = await readResponseBody(res)

  if (!json.success) throw new Error(json.error || '上传失败')

  if (!json.url || !/^https?:\/\//i.test(json.url)) {
    throw new Error('图床未返回有效图片地址')
  }

  return json.url

}



// ============================================================

// W4-4b 直传（presign）：能力允许时 ticket → PUT → commit，

// 任一步失败重试 1 次（重新 ticket）；仍失败按体积回退代理或明确报错。

// 兰空/压缩链路零改动：直传只在 prepareFileForUpload 之后的调用点分流。

// ============================================================

function requestDirectTicket(params) {

  return fetch('/api/admin/storage-ticket', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    credentials: 'same-origin',

    body: JSON.stringify(params),

  }).then(async (res) => {

    const data = await res.json().catch(() => null)

    if (!res.ok || !data || data.success === false) {

      const error = new Error((data && data.message) || `直传请求失败：HTTP ${res.status}`)

      error.code = (data && data.error) || ''

      throw error

    }

    return data

  })

}



function commitDirectUpload(commitToken) {

  return fetch('/api/admin/storage-commit', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    credentials: 'same-origin',

    body: JSON.stringify({ commitToken }),

  }).then(async (res) => {

    const data = await res.json().catch(() => null)

    if (!res.ok || !data || data.success === false) {

      const error = new Error((data && data.message) || `登记请求失败：HTTP ${res.status}`)

      error.code = (data && data.error) || ''

      throw error

    }

    return data

  })

}



function xhrPutToPresignedUrl(putUrl, file, headers, onProgress) {

  return new Promise((resolve, reject) => {

    const xhr = new XMLHttpRequest()

    xhr.open('PUT', putUrl, true)

    const entries = Object.entries(headers || {})

    for (const [name, value] of entries) {

      xhr.setRequestHeader(name, value)

    }

    if (onProgress && xhr.upload) {

      xhr.upload.onprogress = (e) => {

        if (e.lengthComputable && e.total > 0) {

          onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))

        }

      }

    }

    xhr.onload = () => {

      if (xhr.status >= 200 && xhr.status < 300) resolve()

      else reject(new Error(`直传写入失败：HTTP ${xhr.status}`))

    }

    xhr.onerror = () => reject(new Error('直传写入失败（网络错误）'))

    xhr.onabort = () => reject(new Error('直传写入已取消'))

    xhr.ontimeout = () => reject(new Error('直传写入超时'))

    xhr.send(file)

  })

}



async function resolvePresignCapability() {

  if (presignCapabilityMemo && Date.now() - presignCapabilityMemo.at < PRESIGN_CAPABILITY_CACHE_MS) {

    return presignCapabilityMemo.enabled

  }

  try {

    const res = await fetch('/api/admin/attachment-capability', { credentials: 'same-origin' })

    const data = await res.json().catch(() => null)

    const enabled = !!(

      res.ok &&

      data &&

      data.success &&

      data.backend === 'storage_base' &&

      data.presignEnabled === true

    )

    if (enabled) presignCapabilityMemo = { enabled: true, at: Date.now() }

    return enabled

  } catch {

    return false

  }

}



/** 测试辅助：清空直传能力客户端缓存 */

export function __resetPresignCapabilityCacheForTest() {

  presignCapabilityMemo = null

}



async function uploadViaDirect(file, { onProgress } = {}) {

  let everPutOk = false

  let lastError = null



  for (let attempt = 0; attempt < 2; attempt += 1) {

    try {

      const ticket = await requestDirectTicket({

        type: 'image',

        postKey: '',

        filename: file.name || 'image.png',

        contentType: file.type || 'application/octet-stream',

        sizeBytes: file.size,

      })

      if (!ticket.putUrl || !ticket.commitToken) {

        throw new Error('直传凭据不完整')

      }

      await xhrPutToPresignedUrl(ticket.putUrl, file, ticket.requiredHeaders, onProgress)

      everPutOk = true

      const committed = await commitDirectUpload(ticket.commitToken)

      const url = String(committed.url || ticket.url || '').trim()

      if (!/^https?:\/\//i.test(url)) {

        throw new Error('直传未返回有效图片地址')

      }

      return url

    } catch (e) {

      lastError = e

    }

  }



  if (everPutOk) {

    // 文件已写入但登记两次都失败：不得静默成功，也不得换道重传

    const error = new Error('文件已上传但未保存成功，请重试')

    error.commitFailedNoFallback = true

    throw error

  }

  throw lastError

}



/**

 * 直传优先 + 自动回退：能力不可用走原代理（零行为变化）；

 * 直传失败且 ≤4MB 回退代理（无感），>4MB 明确报错。

 */

export async function uploadDirectOrProxy(file, { onProgress } = {}) {

  const directEnabled = await resolvePresignCapability()

  if (!directEnabled) return uploadViaProxy(file)



  try {

    return await uploadViaDirect(file, { onProgress })

  } catch (e) {

    if (e && e.commitFailedNoFallback) throw e

    if (file.size > DIRECT_FALLBACK_SAFE_BYTES) {

      throw new Error('上传失败，请检查网络后重试')

    }

    return uploadViaProxy(file)

  }

}



async function prepareImageForUpload(file, opts = {}) {

  let prepared = await compressImageForGallery(file, opts)

  // W4-5a（§9.1-3）：二次 3.5MB 硬压同样条件化——直传路径不做，回退路径保留；
  // 动图经 compressImageForGallery 已豁免（原样返回或已在上方报错）

  if (opts.directAvailable !== true && !isLocalDevHost() && prepared.size > PROXY_SAFE_BYTES) {

    prepared = await compressImageFile(prepared, {

      maxBytes: PROXY_SAFE_BYTES,

      maxDim: GALLERY_MAX_DIM,

      minQuality: 0.45,

    })

  }

  return prepared

}



async function prepareFileForUpload(file, opts = {}) {

  if (/^image\//i.test(file.type || '')) {

    return prepareImageForUpload(file, opts)

  }

  // 非图片分支行为不变（§9.2-10）：>3.5MB 仍由下方 compressImageFile 报错，并非原样透传

  if (isLocalDevHost()) return file

  if (file.size <= PROXY_SAFE_BYTES) return file

  return compressImageFile(file, {

    maxBytes: PROXY_SAFE_BYTES,

    maxDim: 4096,

    minQuality: 0.42,

  })

}



/**

 * 通用上传（封面、图片块、加密块等）：压缩图片 + 全局队列

 */

export async function uploadImageToLsky(file) {

  if (!file) throw new Error('未选择文件')



  return enqueueLskyUpload(async () => {

    // W4-5a（§9.1-3）：直传能力查询前置（复用 60s 缓存），传入压缩链决定是否做 3.5MB 硬压

    const directAvailable = await resolvePresignCapability()

    let prepared = await prepareFileForUpload(file, { directAvailable })

    try {

      return await uploadDirectOrProxy(prepared)

    } catch (e) {

      if (e.message === 'VERCEL_PAYLOAD_TOO_LARGE' && !isLocalDevHost()) {

        // W4-5a（§9.2-7）：413 恢复改走 compressImageForGallery（含新格式决策），

        // 不再直调老压缩入口，避免把动图/透明图压毁

        prepared = await compressImageForGallery(file, { directAvailable })

        return uploadDirectOrProxy(prepared)

      }

      throw e

    }

  })

}



/** 图库批量上传 */

export async function uploadGalleryImageToLsky(file) {

  if (!file) throw new Error('未选择文件')

  return enqueueLskyUpload(async () => {

    const directAvailable = await resolvePresignCapability()

    const prepared = await compressImageForGallery(file, { directAvailable })

    const url = await uploadDirectOrProxy(prepared)

    return { url, fileSize: prepared.size }

  })

}



/** 限制并发数的批量任务（实际上传仍走 enqueue 限速） */

export async function mapWithConcurrency(items, concurrency, mapper) {

  const results = new Array(items.length)

  let index = 0



  const workers = Array.from(

    { length: Math.min(concurrency, items.length) },

    async () => {

      while (index < items.length) {

        const i = index++

        results[i] = await mapper(items[i], i)

      }

    }

  )



  await Promise.all(workers)

  return results

}


