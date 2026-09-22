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



async function loadImageFromFile(file) {

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



  const img = await loadImageFromFile(file)



  let width = img.naturalWidth

  let height = img.naturalHeight

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



/** 图库 / 图片块共用压缩（兰空 API 不会自动压缩） */

export async function compressImageForGallery(file) {

  if (!file || !/^image\//i.test(file.type || '')) return file



  const img = await loadImageFromFile(file)

  const maxSide = Math.max(img.naturalWidth, img.naturalHeight)

  if (file.size <= GALLERY_SKIP_BYTES && maxSide <= GALLERY_MAX_DIM) {

    return file

  }



  const compressed = await compressImageFile(file, {

    maxBytes: GALLERY_TARGET_BYTES,

    maxDim: GALLERY_MAX_DIM,

    minQuality: 0.38,

  })



  if (!isLocalDevHost() && compressed.size > PROXY_SAFE_BYTES) {

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



async function prepareImageForUpload(file) {

  let prepared = await compressImageForGallery(file)

  if (!isLocalDevHost() && prepared.size > PROXY_SAFE_BYTES) {

    prepared = await compressImageFile(prepared, {

      maxBytes: PROXY_SAFE_BYTES,

      maxDim: GALLERY_MAX_DIM,

      minQuality: 0.45,

    })

  }

  return prepared

}



async function prepareFileForUpload(file) {

  if (/^image\//i.test(file.type || '')) {

    return prepareImageForUpload(file)

  }

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

    let prepared = await prepareFileForUpload(file)

    try {

      return await uploadDirectOrProxy(prepared)

    } catch (e) {

      if (e.message === 'VERCEL_PAYLOAD_TOO_LARGE' && !isLocalDevHost()) {

        prepared = await compressImageFile(file, {

          maxBytes: Math.floor(PROXY_SAFE_BYTES * 0.75),

          maxDim: 4096,

          minQuality: 0.42,

        })

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

    const prepared = await compressImageForGallery(file)

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


