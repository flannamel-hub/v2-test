import {
  mapWithConcurrency,
  uploadImageToLsky,
} from '@/src/lib/admin/lskyClientUpload'

const UPLOAD_CONCURRENCY = 4

export function createPendingImageBlock(file) {
  const previewUrl = URL.createObjectURL(file)
  return {
    id: Date.now() + Math.random(),
    type: 'image',
    content: previewUrl,
    pendingFile: file,
    pwd: '',
    url: '',
    uploading: false,
    error: '',
    isCover: false,
  }
}

export function isImageBlockPending(block) {
  if (block?.type !== 'image') return false
  if (block.pendingFile instanceof Blob) return true
  return typeof block.content === 'string' && block.content.startsWith('blob:')
}

export function isLockImagePending(block, url) {
  if (!url?.startsWith('blob:')) return false
  return (block.pendingImageFiles || []).some((p) => p.url === url)
}

async function resolveUploadFile(file, blobUrl) {
  if (file instanceof Blob && file.size > 0) return file
  if (typeof blobUrl === 'string' && blobUrl.startsWith('blob:')) {
    const res = await fetch(blobUrl)
    if (!res.ok) {
      throw new Error('无法读取待发布的本地图片，请重新选择图片')
    }
    const blob = await res.blob()
    if (!blob.size) {
      throw new Error('图片文件为空，请重新选择')
    }
    const type = blob.type || 'image/png'
    const ext = type.split('/')[1]?.split('+')[0] || 'png'
    return new File([blob], `upload-${Date.now()}.${ext}`, { type })
  }
  throw new Error('缺少可上传的图片文件，请重新选择图片')
}

export function revokeBlockPendingMedia(block) {
  if (!block) return
  if (isImageBlockPending(block) && block.content?.startsWith('blob:')) {
    URL.revokeObjectURL(block.content)
  }
  if (block.type === 'lock') {
    ;(block.pendingImageFiles || []).forEach(({ url }) => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    })
  }
}

export function revokePendingEditorMedia(blocks) {
  ;(blocks || []).forEach(revokeBlockPendingMedia)
}

export function countPendingEditorMedia(blocks) {
  let n = 0
  for (const b of blocks || []) {
    if (isImageBlockPending(b)) n += 1
    if (b.type === 'lock') n += (b.pendingImageFiles || []).length
  }
  return n
}

/** 提交 Notion 前剥离内部字段 */
export function serializeBlocksForSave(blocks) {
  return (blocks || []).map((b) => ({
    type: b.type,
    content: b.content || '',
    pwd: b.pwd || '',
    lockPwd: b.lockPwd ?? b.pwd ?? '',
    locked: b.type === 'lock' ? true : !!b.locked,
    url: b.url || '',
    images: b.images || [],
    bold: !!b.bold,
    italic: !!b.italic,
    color: b.color || 'default',
    isCover: !!b.isCover,
  }))
}

export function blocksToMarkdown(blocks) {
  return (blocks || [])
    .map((raw) => {
      // code/toggle 的 content 为行数组：先归一化为多行字符串，保证下方各分支（含加密分支）统一按字符串处理
      const b = raw && (raw.type === 'code' || raw.type === 'toggle') && Array.isArray(raw.content)
        ? { ...raw, content: raw.content.join('\n') }
        : raw;
      if (b.type === 'h1') return `# ${b.content}`
      if (b.type === 'note') return `\`${b.content}\``
      if (b.type === 'quote') {
        return (b.content || '').split(/\r?\n/).map((l) => `> ${l}`).join('\n')
      }
      if (b.type === 'link') {
        return b.url ? `[${b.content || b.url}](${b.url})` : b.content || ''
      }
      if (b.type === 'lock' || b.locked) {
        const pwd = b.type === 'lock' ? (b.pwd || '') : (b.lockPwd || b.pwd || '')
        const imgLines = (b.images || []).map((u) => `![](${u})`)
        const parts = []
        if (b.type === 'h1' && b.content?.trim()) parts.push(`# ${b.content.trim()}`)
        else if (b.type === 'quote' && b.content?.trim()) {
          b.content.split(/\r?\n/).forEach((l) => parts.push(`> ${l}`))
        } else if (b.type === 'link') {
          const label = b.content || b.url || ''
          if (b.url) parts.push(`[${label}](${b.url})`)
          else if (label) parts.push(label)
        } else if (b.type === 'image' && b.content?.trim()) {
          parts.push(`![](${b.content.trim()})`)
        } else if (b.type === 'note' && b.content?.trim()) {
          parts.push(`\`${b.content}\``)
        } else if (b.content?.trim()) {
          parts.push(b.content)
        }
        imgLines.forEach((l) => parts.push(l))
        return `:::lock ${pwd}\n${parts.join('\n')}\n:::`
      }
      if (b.type === 'image') return b.content ? `![](${b.content})` : ''
      // Phase5 序列化补齐：ol/ul/todo/code/toggle/text
      if (b.type === 'ol') {
        return String(b.content || '').split(/\r?\n/).map((l, i) => `${i + 1}. ${l}`).join('\n')
      }
      if (b.type === 'ul') {
        return String(b.content || '').split(/\r?\n/).map((l) => `- ${l}`).join('\n')
      }
      if (b.type === 'todo') {
        return String(b.content || '')
          .split(/\r?\n/)
          .map((l, i) => `${Array.isArray(b.checked) && b.checked[i] ? '[x]' : '[ ]'} ${l}`)
          .join('\n')
      }
      if (b.type === 'code') {
        const codeText = Array.isArray(b.content) ? b.content.join('\n') : String(b.content || '')
        return `\`\`\`${b.language || ''}\n${codeText}\n\`\`\``
      }
      if (b.type === 'toggle') {
        const lines = Array.isArray(b.content) ? b.content : String(b.content || '').split(/\r?\n/)
        const head = `**${lines[0] || ''}**`
        const body = lines.slice(1).map((l) => `    ${l}`)
        return [head, ...body].join('\n')
      }
      if (b.type === 'text') return b.content
      return b.content
    })
    .filter((s) => s !== '')
    .join('\n\n')
}

export function isVideoImageContent(content) {
  return /\.(mp4|mov|webm|ogg|mkv)(\?|$)/i.test(content || '')
}

/** 编辑器内是否存在任意图片块 */
export function hasEditorImageBlock(blocks) {
  return (blocks || []).some((b) => b.type === 'image')
}

export {
  findCoverImageBlock,
  findManualCoverImageBlock,
  findAutoCoverImageBlock,
  resolveCoverFromBlocks,
  resolveAutoCover,
  setBlockAsCover,
  clearManualCoverFlags,
  syncCoverFlagsFromSavedCover,
} from '@/src/lib/admin/editorCover'

/**
 * 发布/保存前：上传正文 pending 图片，返回可写入 Notion 的块列表
 */
export async function flushEditorBlocksMedia(blocks, { onProgress } = {}) {
  const list = blocks || []
  const tasks = []

  for (let blockIndex = 0; blockIndex < list.length; blockIndex++) {
    const block = list[blockIndex]
    const blockId =
      block.id != null ? String(block.id) : `block-${blockIndex}`

    if (isImageBlockPending(block)) {
      tasks.push({
        kind: 'image',
        blockId,
        file: block.pendingFile,
        blobUrl: block.content,
      })
    }
    if (block.type === 'lock') {
      for (const entry of block.pendingImageFiles || []) {
        tasks.push({
          kind: 'lock',
          blockId,
          blobUrl: entry.url,
          file: entry.file,
        })
      }
    }
  }

  const uploadMap = new Map()

  if (tasks.length > 0) {
    let done = 0
    await mapWithConcurrency(tasks, UPLOAD_CONCURRENCY, async (task) => {
      const file = await resolveUploadFile(task.file, task.blobUrl)
      const url = await uploadImageToLsky(file)
      if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error('图床未返回有效图片地址，请稍后重试')
      }
      const key =
        task.kind === 'image'
          ? `image:${task.blockId}`
          : `lock:${task.blockId}:${task.blobUrl}`
      uploadMap.set(key, url)
      done += 1
      onProgress?.({ done, total: tasks.length })
    })
  }

  return list.map((block, blockIndex) => {
    const blockId =
      block.id != null ? String(block.id) : `block-${blockIndex}`

    if (isImageBlockPending(block)) {
      const url = uploadMap.get(`image:${blockId}`)
      if (!url) {
        throw new Error('正文图片上传未完成，请重试保存')
      }
      if (block.content?.startsWith('blob:')) URL.revokeObjectURL(block.content)
      return {
        ...block,
        content: url,
        pendingFile: undefined,
        uploading: false,
        error: '',
      }
    }

    if (block.type === 'lock' && (block.pendingImageFiles || []).length > 0) {
      const newImages = (block.images || []).map((imgUrl) => {
        if (!imgUrl?.startsWith('blob:')) return imgUrl
        const uploaded = uploadMap.get(`lock:${blockId}:${imgUrl}`)
        if (!uploaded) {
          throw new Error('加密块图片上传未完成，请重试保存')
        }
        URL.revokeObjectURL(imgUrl)
        return uploaded
      })
      return {
        ...block,
        images: newImages,
        pendingImageFiles: [],
        lockUploading: false,
        error: '',
      }
    }

    return block
  })
}
