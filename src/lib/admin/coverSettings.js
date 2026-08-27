import CONFIG from '@/blog.config'
import { isDefaultPostCover } from '@/src/lib/gallery/postCover'
import {
  clearManualCoverFlags,
  coverUrlsMatch,
  findAutoCoverImageBlock,
  findManualCoverImageBlock,
  isImageBlockEligibleForCover,
  setBlockAsCover,
  syncCoverFlagsFromSavedCover,
} from '@/src/lib/admin/editorCover'

export const COVER_MODE_AUTO = 'auto'
export const COVER_MODE_DEFAULT = 'default'
export const COVER_MODE_URL = 'url'
export const COVER_MODE_BODY = 'body'
export const COVER_MODE_GALLERY = 'gallery'

export const DEFAULT_COVER_URL = CONFIG.DEFAULT_POST_COVER

export function galleryItemUrl(item) {
  if (!item) return ''
  return item.status === 'pending' ? item.previewUrl || '' : item.url || ''
}

export function findManualCoverGalleryItem(items) {
  return (items || []).find((it) => it.isCover && galleryItemUrl(it))
}

export function findAutoCoverGalleryItem(items) {
  return (items || []).find((it) => galleryItemUrl(it))
}

export function findCoverGalleryItem(items, coverMode) {
  if (coverMode === COVER_MODE_GALLERY) {
    return findManualCoverGalleryItem(items)
  }
  if (coverMode === COVER_MODE_AUTO) {
    return findAutoCoverGalleryItem(items)
  }
  return null
}

export function setGalleryItemAsCover(items, index) {
  return (items || []).map((it, i) => ({ ...it, isCover: i === index }))
}

export function clearGalleryCoverFlags(items) {
  return (items || []).map((it) => ({ ...it, isCover: false }))
}

export function createInitialCoverSettings() {
  return {
    mode: COVER_MODE_AUTO,
    manualUrl: '',
  }
}

/** 写入 Notion cover 字段（auto 模式留空，由前端按图库/正文回退） */
export function resolveNotionCoverForSave({
  coverMode,
  manualCoverUrl,
  blocks,
  galleryItems,
  defaultCoverUrl = DEFAULT_COVER_URL,
}) {
  if (coverMode === COVER_MODE_DEFAULT) return defaultCoverUrl
  if (coverMode === COVER_MODE_URL) {
    return (manualCoverUrl || '').trim()
  }
  if (coverMode === COVER_MODE_BODY) {
    const block = findManualCoverImageBlock(blocks)
    const url = block?.content?.trim()
    return url && /^https?:\/\//i.test(url) ? url : ''
  }
  if (coverMode === COVER_MODE_GALLERY) {
    const item = findManualCoverGalleryItem(galleryItems)
    const url = galleryItemUrl(item)
    return url && /^https?:\/\//i.test(url) ? url : ''
  }
  // auto(默认):自动采取正文首图或图库首图作为封面(修复:原实现留空,导致新文章前台显示默认封面)
  const autoBlock = findAutoCoverImageBlock(blocks)
  const autoBlockUrl = autoBlock?.content?.trim()
  if (autoBlockUrl && /^https?:\/\//i.test(autoBlockUrl)) return autoBlockUrl
  const autoGalleryItem = findAutoCoverGalleryItem(galleryItems)
  const autoGalleryUrl = galleryItemUrl(autoGalleryItem)
  if (autoGalleryUrl && /^https?:\/\//i.test(autoGalleryUrl)) return autoGalleryUrl
  return ''
}

/**
 * 二次编辑：从已保存 cover 恢复封面设定模式与各来源标记
 */
export function restoreEditorCoverState({
  savedCoverUrl,
  blocks = [],
  galleryItems = [],
  defaultCoverUrl = DEFAULT_COVER_URL,
}) {
  const cover = (savedCoverUrl || '').trim()
  const base = {
    coverSettings: createInitialCoverSettings(),
    blocks: clearManualCoverFlags(blocks),
    galleryItems: clearGalleryCoverFlags(galleryItems),
  }

  if (!cover) return base

  if (isDefaultPostCover(cover) || coverUrlsMatch(cover, defaultCoverUrl)) {
    return {
      ...base,
      coverSettings: { mode: COVER_MODE_DEFAULT, manualUrl: '' },
    }
  }

  const autoGallery = findAutoCoverGalleryItem(galleryItems)
  const autoGalleryUrl = galleryItemUrl(autoGallery)
  const galleryIndex = (galleryItems || []).findIndex((it) =>
    coverUrlsMatch(cover, galleryItemUrl(it))
  )
  if (galleryIndex >= 0) {
    if (autoGalleryUrl && coverUrlsMatch(cover, autoGalleryUrl)) {
      return base
    }
    return {
      coverSettings: { mode: COVER_MODE_GALLERY, manualUrl: '' },
      blocks: clearManualCoverFlags(blocks),
      galleryItems: setGalleryItemAsCover(galleryItems, galleryIndex),
    }
  }

  const autoBody = findAutoCoverImageBlock(blocks)
  const autoBodyUrl = autoBody?.content?.trim() || ''
  if (autoBodyUrl && coverUrlsMatch(cover, autoBodyUrl)) {
    return base
  }

  const syncedBlocks = syncCoverFlagsFromSavedCover(blocks, cover)
  if (findManualCoverImageBlock(syncedBlocks)) {
    return {
      coverSettings: { mode: COVER_MODE_BODY, manualUrl: '' },
      blocks: syncedBlocks,
      galleryItems: clearGalleryCoverFlags(galleryItems),
    }
  }

  return {
    coverSettings: { mode: COVER_MODE_URL, manualUrl: cover },
    blocks: clearManualCoverFlags(blocks),
    galleryItems: clearGalleryCoverFlags(galleryItems),
  }
}

export function resolveEditorBodyCoverBlockId(blocks, coverMode, galleryItems) {
  if (coverMode === COVER_MODE_BODY) {
    return findManualCoverImageBlock(blocks)?.id ?? null
  }
  if (coverMode === COVER_MODE_AUTO) {
    const hasGallery = (galleryItems || []).some((it) => galleryItemUrl(it))
    if (hasGallery) return null
    return findAutoCoverImageBlock(blocks)?.id ?? null
  }
  return null
}

/** 图库项：当前应高亮为封面的 index（auto / gallery 模式） */
export function resolveEditorGalleryCoverIndex(items, coverMode) {
  if (coverMode === COVER_MODE_GALLERY) {
    return (items || []).findIndex((it) => it.isCover)
  }
  if (coverMode === COVER_MODE_AUTO) {
    return (items || []).length > 0 ? 0 : -1
  }
  return -1
}

export function applyBodyCoverSelection(blocks, blockId) {
  return {
    coverSettings: { mode: COVER_MODE_BODY, manualUrl: '' },
    blocks: setBlockAsCover(blocks, blockId),
    clearGallery: true,
  }
}

export function applyGalleryCoverSelection(items, index) {
  return {
    coverSettings: { mode: COVER_MODE_GALLERY, manualUrl: '' },
    galleryItems: setGalleryItemAsCover(items, index),
    clearBody: true,
  }
}

export function applyManualCoverUrl(url) {
  return {
    coverSettings: { mode: COVER_MODE_URL, manualUrl: (url || '').trim() },
    clearBody: true,
    clearGallery: true,
  }
}

export function applyDefaultCoverToggle(enabled) {
  if (enabled) {
    return {
      coverSettings: { mode: COVER_MODE_DEFAULT, manualUrl: '' },
      clearBody: true,
      clearGallery: true,
    }
  }
  return {
    coverSettings: createInitialCoverSettings(),
    clearBody: true,
    clearGallery: true,
  }
}

export function clearBodyCoverSelection(blocks, coverMode) {
  const nextBlocks = clearManualCoverFlags(blocks)
  if (coverMode !== COVER_MODE_BODY) {
    return { blocks: nextBlocks, coverSettings: null }
  }
  return {
    blocks: nextBlocks,
    coverSettings: createInitialCoverSettings(),
  }
}

export function clearGalleryCoverSelection(items, coverMode) {
  const nextItems = clearGalleryCoverFlags(items)
  if (coverMode !== COVER_MODE_GALLERY) {
    return { galleryItems: nextItems, coverSettings: null }
  }
  return {
    galleryItems: nextItems,
    coverSettings: createInitialCoverSettings(),
  }
}

function getBodyImageOrdinal(blocks, blockId) {
  if (blockId == null) return 0
  let n = 0
  for (const b of blocks || []) {
    if (!isImageBlockEligibleForCover(b)) continue
    n += 1
    if (b.id === blockId) return n
  }
  return 0
}

/**
 * 编辑器封面说明栏：当前生效模式文案
 * @returns {{ label: string, tag: '手动'|'自动', full: string }}
 */
export function formatEditorCoverStatus({
  coverSettings,
  blocks = [],
  galleryItems = [],
}) {
  const mode = coverSettings?.mode || COVER_MODE_AUTO
  const manualTag = '手动'
  const autoTag = '自动'

  if (mode === COVER_MODE_DEFAULT) {
    return {
      label: '站点默认封面',
      tag: manualTag,
      full: `当前：站点默认封面 · ${manualTag}`,
    }
  }

  if (mode === COVER_MODE_URL) {
    const url = (coverSettings.manualUrl || '').trim()
    const short =
      url.length > 40 ? `${url.slice(0, 40)}…` : url || '未填写'
    return {
      label: `图片直链（${short}）`,
      tag: manualTag,
      full: `当前：图片直链 · ${manualTag}`,
    }
  }

  if (mode === COVER_MODE_BODY) {
    const block = findManualCoverImageBlock(blocks)
    const ord = getBodyImageOrdinal(blocks, block?.id)
    const label = ord > 0 ? `正文第 ${ord} 张` : '正文图片块'
    return {
      label,
      tag: manualTag,
      full: `当前：${label} · ${manualTag}`,
    }
  }

  if (mode === COVER_MODE_GALLERY) {
    const idx = (galleryItems || []).findIndex((it) => it.isCover)
    const ord = idx >= 0 ? idx + 1 : 0
    const label = ord > 0 ? `图库第 ${ord} 张` : '图库图片'
    return {
      label,
      tag: manualTag,
      full: `当前：${label} · ${manualTag}`,
    }
  }

  const hasGallery = (galleryItems || []).some((it) => galleryItemUrl(it))
  if (hasGallery) {
    return {
      label: '图库第 1 张',
      tag: autoTag,
      full: `当前：图库第 1 张 · ${autoTag}`,
    }
  }

  const autoBlock = findAutoCoverImageBlock(blocks)
  if (autoBlock) {
    const ord = getBodyImageOrdinal(blocks, autoBlock.id)
    const label = ord > 0 ? `正文第 ${ord} 张` : '正文首图'
    return {
      label,
      tag: autoTag,
      full: `当前：${label} · ${autoTag}`,
    }
  }

  return {
    label: '无可用图片',
    tag: autoTag,
    full: `当前：无可用图片（Standard 使用默认封面） · ${autoTag}`,
  }
}
