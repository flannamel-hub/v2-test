import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countPendingGalleryItems,
  createPendingGalleryItem,
  galleryPreviewUrl,
  persistGalleryRemote,
  remoteFromApiImage,
  revokePendingGalleryItems,
  sumPendingGalleryBytes,
  checkGalleryStorageBeforeAdd,
} from '@/src/lib/admin/galleryFlush'

const btnSpinStyle = {
  width: '14px',
  height: '14px',
  border: '2px solid rgba(0,0,0,0.15)',
  borderTopColor: '#000',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  display: 'inline-block',
}

const sortModeKeyframes = `
@keyframes gallery-sort-wiggle {
  0%, 100% { transform: rotate(-0.6deg); }
  50% { transform: rotate(0.6deg); }
}
@keyframes gallery-drop-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(173, 255, 47, 0.35), inset 0 0 28px rgba(173, 255, 47, 0.1); }
  50% { box-shadow: 0 0 0 5px rgba(173, 255, 47, 0.45), inset 0 0 36px rgba(173, 255, 47, 0.14); }
}
.img-drop.img-drop-over {
  border-color: greenyellow !important;
  background: #1f261b !important;
  color: greenyellow !important;
  animation: gallery-drop-pulse 1.2s ease-in-out infinite;
  transform: scale(1.01);
}
@keyframes gallery-mgr-spin { to { transform: rotate(360deg); } }
`

/**
 * Gallery 图库：选图本地预览，发布/保存时由父组件统一上传兰空并写入 Supabase
 */
export function GalleryManager({
  postSlug,
  postTitle,
  postNotionId,
  items,
  onItemsChange,
  onGalleryMutated,
  coverMode = 'auto',
  coverIndex = -1,
  onSetCover,
  onClearCover,
}) {
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(false)
  const [error, setError] = useState('')
  const [sortMode, setSortMode] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [fileDragOver, setFileDragOver] = useState(false)
  const fileDragDepthRef = useRef(0)

  const slug = (postSlug || '').trim()
  const pendingCount = countPendingGalleryItems(items)

  const itemsRef = useRef(items)
  itemsRef.current = items

  const loadGallery = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/admin/gallery?slug=${encodeURIComponent(slug)}`)
      const d = await r.json()
      if (!d.success) throw new Error(d.error || '加载失败')
      const remote = (d.images || []).map(remoteFromApiImage)
      onItemsChange((prev) => {
        const pending = (prev || []).filter((it) => it.status === 'pending')
        const prevRemote = (prev || []).filter((it) => it.status === 'remote')
        const remote = (d.images || []).map((img) => {
          const item = remoteFromApiImage(img)
          const matched = prevRemote.find((p) => p.url === item.url)
          if (matched?.isCover) item.isCover = true
          return item
        })
        return [...remote, ...pending]
      })
    } catch (e) {
      setError(e.message)
      onItemsChange((prev) => (prev || []).filter((it) => it.status === 'pending'))
    } finally {
      setLoading(false)
    }
  }, [slug, onItemsChange])

  useEffect(() => {
    loadGallery()
  }, [loadGallery])

  useEffect(() => {
    return () => revokePendingGalleryItems(itemsRef.current)
  }, [])

  useEffect(() => {
    const clearFileDrag = () => resetFileDragOver()
    window.addEventListener('dragend', clearFileDrag)
    return () => window.removeEventListener('dragend', clearFileDrag)
  }, [])

  const reorderItems = (from, to) => {
    if (from === to || from == null || to == null) return
    onItemsChange((prev) => {
      const next = [...(prev || [])]
      if (from < 0 || from >= next.length || to < 0 || to >= next.length) return prev
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    onGalleryMutated?.()
  }

  const exitSortMode = () => {
    setSortMode(false)
    setDragIndex(null)
    setOverIndex(null)
  }

  const saveSortOrder = async () => {
    if (!slug) {
      alert('缺少文章 slug，无法保存排序')
      return
    }
    exitSortMode()
    onGalleryMutated?.()

    const remoteItems = (items || []).filter((it) => it.status === 'remote')
    if (!remoteItems.length) {
      setSaveDone(true)
      setTimeout(() => setSaveDone(false), 2000)
      return
    }

    setSaving(true)
    setSaveDone(false)
    setError('')
    try {
      await persistGalleryRemote({
        slug,
        postTitle,
        postNotionId,
        items,
      })
      setSaveDone(true)
      setTimeout(() => setSaveDone(false), 2500)
      await loadGallery()
    } catch (e) {
      setError(e.message)
      alert('图库排序保存失败：' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSortButton = () => {
    if (saving) return
    if (!sortMode) {
      setSortMode(true)
      setSaveDone(false)
      return
    }
    saveSortOrder()
  }

  const isExternalFileDrag = (e) =>
    Array.from(e.dataTransfer?.types || []).includes('Files')

  const resetFileDragOver = () => {
    fileDragDepthRef.current = 0
    setFileDragOver(false)
  }

  const handleFiles = async (fileList) => {
    if (sortMode) return
    const files = Array.from(fileList || []).filter((f) =>
      /^image\//i.test(f.type)
    )
    if (!files.length) return
    if (!slug) {
      alert('缺少文章 slug，无法添加图库')
      return
    }
    setProcessing(true)
    try {
      const addBytes = files.reduce((s, f) => s + (f.size || 0), 0)
      const pendingBytes = sumPendingGalleryBytes(items) + addBytes
      setError('')
      try {
        await checkGalleryStorageBeforeAdd(pendingBytes)
      } catch (e) {
        setError(e.message)
        alert(e.message)
        return
      }
      const pending = files.map(createPendingGalleryItem)
      onItemsChange((prev) => [...(prev || []), ...pending])
      onGalleryMutated?.()
    } finally {
      setProcessing(false)
    }
  }

  const removeAt = (index) => {
    if (sortMode) return
    onItemsChange((prev) => {
      const next = [...(prev || [])]
      const removed = next[index]
      if (removed?.status === 'pending' && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl)
      }
      next.splice(index, 1)
      return next
    })
    onGalleryMutated?.()
  }

  const handleSetCover = (index, e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (sortMode) return
    onSetCover?.(index)
  }

  const handleClearCover = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (sortMode) return
    onClearCover?.()
  }

  const handleDragStart = (e, index) => {
    if (!sortMode) return
    setDragIndex(index)
    setOverIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.45'
    }
  }

  const handleDragEnd = (e) => {
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '1'
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleDragOver = (e, index) => {
    if (!sortMode || dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overIndex !== index) setOverIndex(index)
  }

  const handleDrop = (e, index) => {
    if (!sortMode || dragIndex === null) return
    e.preventDefault()
    const from = dragIndex
    reorderItems(from, index)
    setDragIndex(null)
    setOverIndex(null)
  }

  if (!slug) {
    return (
      <div
        style={{
          padding: '16px',
          borderRadius: '10px',
          background: '#2a2a2e',
          color: '#999',
          fontSize: '13px',
          lineHeight: 1.6,
        }}
      >
        缺少文章 slug，无法管理图库。
      </div>
    )
  }

  return (
    <div>
      <style>{sortModeKeyframes}</style>

      {!sortMode ? (
        <label
          className={`img-drop${fileDragOver ? ' img-drop-over' : ''}`}
          style={{
            position: 'relative',
            minHeight: '100px',
            marginBottom: '16px',
            transition: 'border-color 0.15s ease, background 0.15s ease, transform 0.15s ease',
          }}
          onDragEnter={(e) => {
            if (!isExternalFileDrag(e)) return
            e.preventDefault()
            e.stopPropagation()
            fileDragDepthRef.current += 1
            setFileDragOver(true)
          }}
          onDragLeave={(e) => {
            if (!isExternalFileDrag(e)) return
            e.preventDefault()
            e.stopPropagation()
            fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
            if (fileDragDepthRef.current === 0) setFileDragOver(false)
          }}
          onDragOver={(e) => {
            if (!isExternalFileDrag(e)) return
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'copy'
            setFileDragOver(true)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            resetFileDragOver()
            if (isExternalFileDrag(e)) {
              handleFiles(e.dataTransfer.files)
            }
          }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <div style={{ pointerEvents: 'none', textAlign: 'center' }}>
            <div
              style={{
                fontSize: '15px',
                color: fileDragOver ? 'greenyellow' : '#fff',
                marginBottom: '6px',
                fontWeight: fileDragOver ? 'bold' : 'normal',
                transition: 'color 0.15s ease',
              }}
            >
              {fileDragOver
                ? '松开鼠标，添加到此图库'
                : '拖拽或点击添加图片（Gallery图库）'}
            </div>
            <div style={{ fontSize: '12px', color: fileDragOver ? '#c5e87a' : '#777' }}>
              {fileDragOver ? '支持多张图片同时放入' : '支持多张同时导入'}
            </div>
          </div>
          {processing ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '10px',
                background: 'rgba(18, 22, 14, 0.82)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                zIndex: 5,
              }}
            >
              <span
                style={{
                  width: '30px',
                  height: '30px',
                  border: '3px solid rgba(173, 255, 47, 0.25)',
                  borderTopColor: 'greenyellow',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'gallery-mgr-spin 0.8s linear infinite',
                }}
              />
              <span style={{ fontSize: '13px', color: 'greenyellow', fontWeight: 'bold' }}>正在导入图片…</span>
            </div>
          ) : null}
        </label>
      ) : (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(173, 255, 47, 0.08)',
            border: '1px solid rgba(173, 255, 47, 0.35)',
            color: '#c5e87a',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          拖拽模式：拖动图片到目标位置，松手即可插入 · 完成后点击「保存排序」
        </div>
      )}

      {loading ? (
        <div style={{ color: '#888', fontSize: '13px', padding: '12px 0' }}>加载图库…</div>
      ) : null}
      {error ? (
        <div style={{ color: '#ff7875', fontSize: '12px', marginBottom: '10px' }}>{error}</div>
      ) : null}

      {items?.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          {items.map((it, index) => {
            const isDragging = sortMode && dragIndex === index
            const isDropTarget =
              sortMode && overIndex === index && dragIndex !== null && dragIndex !== index
            const isCoverItem = coverIndex === index
            const isManualCover =
              coverMode === 'gallery' && it.isCover && isCoverItem
            const isAutoCover =
              coverMode === 'auto' && isCoverItem && !items.some((x) => x.isCover)
            const showInsertBefore =
              sortMode &&
              dragIndex !== null &&
              overIndex === index &&
              dragIndex > index
            const showInsertAfter =
              sortMode &&
              dragIndex !== null &&
              overIndex === index &&
              dragIndex < index

            return (
              <div
                key={`${it.id}-${index}`}
                draggable={sortMode}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                style={{
                  position: 'relative',
                  aspectRatio: '3/4',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: isDropTarget ? '#1a2a12' : '#222',
                  border: isDropTarget
                    ? '2px solid greenyellow'
                    : isCoverItem
                      ? '2px solid #7dd3fc'
                      : it.status === 'pending'
                        ? '1px dashed #f59e0b'
                        : '1px solid #444',
                  boxShadow: isDropTarget
                    ? '0 0 0 3px rgba(173, 255, 47, 0.25), 0 8px 20px rgba(0,0,0,0.35)'
                    : isDragging
                      ? '0 12px 28px rgba(0,0,0,0.45)'
                      : 'none',
                  transform: isDropTarget
                    ? 'scale(1.06)'
                    : isDragging
                      ? 'scale(0.92)'
                      : sortMode
                        ? 'scale(1)'
                        : 'none',
                  transition:
                    'transform 0.18s cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 0.18s ease, border-color 0.15s ease, background 0.15s ease',
                  cursor: sortMode ? (isDragging ? 'grabbing' : 'grab') : 'default',
                  animation:
                    sortMode && !isDragging ? 'gallery-sort-wiggle 0.35s ease-in-out infinite' : 'none',
                  animationDelay: sortMode ? `${(index % 6) * 0.05}s` : '0s',
                  zIndex: isDragging ? 20 : isDropTarget ? 10 : 1,
                }}
              >
                {showInsertBefore ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: '-6px',
                      top: '6%',
                      bottom: '6%',
                      width: '4px',
                      borderRadius: '4px',
                      background: 'greenyellow',
                      boxShadow: '0 0 10px greenyellow',
                      zIndex: 30,
                    }}
                  />
                ) : null}
                {showInsertAfter ? (
                  <div
                    style={{
                      position: 'absolute',
                      right: '-6px',
                      top: '6%',
                      bottom: '6%',
                      width: '4px',
                      borderRadius: '4px',
                      background: 'greenyellow',
                      boxShadow: '0 0 10px greenyellow',
                      zIndex: 30,
                    }}
                  />
                ) : null}

                <img
                  src={galleryPreviewUrl(it)}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                />
                {isCoverItem ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: '4px',
                      right: '4px',
                      bottom: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      alignItems: 'stretch',
                      pointerEvents: sortMode ? 'none' : 'auto',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '9px',
                        fontWeight: 'bold',
                        color: '#000',
                        background: isManualCover ? '#7dd3fc' : 'greenyellow',
                        padding: '3px 4px',
                        borderRadius: '4px',
                        textAlign: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      {isManualCover ? '封面' : '封面(自动)'}
                    </div>
                    {isManualCover && !sortMode ? (
                      <button
                        type="button"
                        onClick={handleClearCover}
                        style={{
                          border: 'none',
                          background: 'rgba(0,0,0,0.72)',
                          color: '#7dd3fc',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '8px',
                          padding: '3px 2px',
                          lineHeight: 1.2,
                        }}
                      >
                        取消设定
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {!sortMode && !isCoverItem ? (
                  <button
                    type="button"
                    title="设为封面"
                    onClick={(e) => handleSetCover(index, e)}
                    style={{
                      position: 'absolute',
                      left: '4px',
                      right: '4px',
                      bottom: '4px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      padding: '4px 3px',
                      lineHeight: 1.2,
                      textAlign: 'center',
                      zIndex: 4,
                    }}
                  >
                    设为封面
                  </button>
                ) : null}
                <div
                  style={{
                    position: 'absolute',
                    inset: '0 0 auto 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '4px',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
                    pointerEvents: sortMode ? 'none' : 'auto',
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#fff' }}>{index + 1}</span>
                  {!sortMode ? (
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      style={{
                        border: 'none',
                        background: 'rgba(0,0,0,0.5)',
                        color: '#ff7875',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '0 4px',
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            color: '#666',
            padding: '24px',
            border: '2px dashed #444',
            borderRadius: '12px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          暂无图片
        </div>
      )}

      {items?.length > 0 ? (
        <button
          type="button"
          onClick={handleSortButton}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px',
            background: sortMode
              ? '#fff'
              : saveDone
                ? '#4dab6d'
                : 'greenyellow',
            color: sortMode ? '#000' : saveDone ? '#fff' : '#000',
            border: sortMode ? '2px solid greenyellow' : 'none',
            borderRadius: '10px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background 0.2s ease, color 0.2s ease',
          }}
        >
          {saving ? (
            <>
              <span style={btnSpinStyle} />
              保存排序中…
            </>
          ) : saveDone && !sortMode ? (
            '✓ 排序已保存'
          ) : sortMode ? (
            '保存排序'
          ) : (
            '调整排序'
          )}
        </button>
      ) : null}
    </div>
  )
}
