/** P14:内容保护客户端核心(框架无关,供 ContentProtectGuard 注入)。
 * - 轻量、可逆:install 返回 detach,卸载时移除全部监听/观察器/注入样式;
 * - contextmenu 全站静默拦截(不弹提示;用户拍板 2026-08-25);
 * - copy/cut/dragstart 拦截,input/textarea/contentEditable 除外(评论框等可正常输入复制);
 * - 全站 img draggable=false(SPA 路由/懒加载新增图片由 MutationObserver 维护),
 *   叠加少量 CSS(-webkit-user-drag:none)覆盖 Safari/Chromium;Firefox 由 dragstart 兜底;
 * - 跨浏览器:contextmenu/copy/cut/dragstart/MutationObserver 均为标准 DOM 能力
 *   (Chrome/Firefox/Safari/Edge 桌面与移动端一致支持);不引第三方依赖。 */

const STYLE_ID = 'blog-content-protect-style'

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

  const onContextMenu = (event: Event) => {
    event.preventDefault()
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
  styleEl.id = STYLE_ID
  styleEl.textContent = `img{-webkit-user-drag:none;}`

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
