/** P14:内容保护客户端核心(框架无关,供 ContentProtectGuard 注入)。
 * - 轻量、可逆:install 返回 detach,卸载时移除全部监听/观察器/注入样式/提示条;
 * - contextmenu 全站拦截并弹轻提示条(2.5s 消失,浅色圆角,与站内 toast 风格一致);
 * - copy/cut/dragstart 拦截,input/textarea/contentEditable 除外(评论框等可正常输入复制);
 * - 全站 img draggable=false(SPA 路由/懒加载新增图片由 MutationObserver 维护),
 *   叠加少量 CSS(-webkit-user-drag:none)覆盖 Safari/Chromium;Firefox 由 dragstart 兜底;
 * - 跨浏览器:contextmenu/copy/cut/dragstart/MutationObserver 均为标准 DOM 能力
 *   (Chrome/Firefox/Safari/Edge 桌面与移动端一致支持);不引第三方依赖。 */

export const CONTENT_PROTECT_NOTICE_TEXT = '🔒 内容受保护，未经授权请勿复制/保存'
export const CONTENT_PROTECT_NOTICE_MS = 2500
const NOTICE_STYLE_ID = 'blog-content-protect-notice-style'
const NOTICE_CLASS = 'blog-content-protect-notice'

/** input/textarea/contentEditable 内的复制/剪切/拖拽放行(评论框可用) */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || el.isContentEditable === true
}

/** API 响应 → 是否启用;任何异常形态一律视为关闭(关闭分支零副作用) */
export function parseContentProtectEnabled(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const data = payload as { success?: unknown; enabled?: unknown }
  return data.success === true && data.enabled === true
}

type DocLike = Document

let currentDetach: (() => void) | null = null

export function installContentProtection(doc: DocLike): () => void {
  // 幂等:重复安装先卸载旧实例
  if (currentDetach) {
    currentDetach()
    currentDetach = null
  }

  let noticeEl: HTMLDivElement | null = null
  let noticeHideTimer: ReturnType<typeof setTimeout> | null = null
  let noticeRemoveTimer: ReturnType<typeof setTimeout> | null = null

  const clearNoticeTimers = () => {
    if (noticeHideTimer) {
      clearTimeout(noticeHideTimer)
      noticeHideTimer = null
    }
    if (noticeRemoveTimer) {
      clearTimeout(noticeRemoveTimer)
      noticeRemoveTimer = null
    }
  }

  const removeNotice = () => {
    clearNoticeTimers()
    if (noticeEl && noticeEl.parentNode) {
      noticeEl.parentNode.removeChild(noticeEl)
    }
    noticeEl = null
  }

  const showNotice = () => {
    clearNoticeTimers()
    if (!noticeEl) {
      noticeEl = doc.createElement('div')
      noticeEl.className = NOTICE_CLASS
      noticeEl.textContent = CONTENT_PROTECT_NOTICE_TEXT
      doc.body.appendChild(noticeEl)
    }
    noticeEl.style.opacity = '1'
    noticeHideTimer = setTimeout(() => {
      if (!noticeEl) return
      noticeEl.style.opacity = '0'
      noticeRemoveTimer = setTimeout(removeNotice, 200)
    }, CONTENT_PROTECT_NOTICE_MS)
  }

  const onContextMenu = (event: Event) => {
    event.preventDefault()
    showNotice()
  }

  const onCopyCut = (event: Event) => {
    if (isEditableTarget(event.target)) return
    event.preventDefault()
  }

  const onDragStart = (event: Event) => {
    if (isEditableTarget(event.target)) return
    event.preventDefault()
  }

  const applyImgDraggable = (root: ParentNode) => {
    const imgs = root.querySelectorAll('img')
    imgs.forEach((img) => {
      img.draggable = false
    })
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return
        const el = node as HTMLElement
        if (el.tagName === 'IMG') {
          el.draggable = false
        } else {
          applyImgDraggable(el)
        }
      })
    }
  })

  // 少量 CSS:补齐 draggable 属性在 Safari/Chromium 下的拖拽缺口;detach 时移除
  const styleEl = doc.createElement('style')
  styleEl.id = NOTICE_STYLE_ID
  styleEl.textContent = `img{-webkit-user-drag:none;}.${NOTICE_CLASS}{position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:2147483000;pointer-events:none;background:rgba(255,255,255,.96);color:#333;padding:10px 18px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.16);font-size:13px;line-height:1.5;opacity:0;transition:opacity .2s ease-out;max-width:86vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}`

  doc.addEventListener('contextmenu', onContextMenu)
  doc.addEventListener('copy', onCopyCut)
  doc.addEventListener('cut', onCopyCut)
  doc.addEventListener('dragstart', onDragStart)
  doc.head.appendChild(styleEl)
  applyImgDraggable(doc)
  observer.observe(doc.documentElement || doc.body, {
    childList: true,
    subtree: true,
  })

  const detach = () => {
    doc.removeEventListener('contextmenu', onContextMenu)
    doc.removeEventListener('copy', onCopyCut)
    doc.removeEventListener('cut', onCopyCut)
    doc.removeEventListener('dragstart', onDragStart)
    observer.disconnect()
    if (styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl)
    }
    removeNotice()
  }

  currentDetach = detach
  return detach
}

/** 供测试/外部强制卸载当前防护 */
export function teardownContentProtection(): void {
  if (currentDetach) {
    currentDetach()
    currentDetach = null
  }
}
