/** R16：后台新手聚焦引导（6 步，遮罩挖孔 + 小气泡）。
 * 手写零依赖：createPortal 挂 document.body（后台在 #admin-container z-index:9999 内，
 * 必须脱离该层叠上下文），引导层 z-index:10100 压过后台一切弹层。
 * 挖孔法：单个 fixed div 定位在目标 rect（外扩 6px、圆角 8）+ box-shadow 0 0 0 9999px 遮罩。
 * 行为：每步先 scrollIntoView({block:'center'}) 再定位；resize/scroll 重算；
 * 目标缺失或零尺寸自动跳过该步；Esc=跳过；prefers-reduced-motion 去过渡。 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const TOUR_STEPS = [
  { anchor: 'site-info', text: '这是你的站点标题，点击标题文字可重命名。' },
  { anchor: 'publish', text: '写文章、发布内容，都从这里开始。' },
  { anchor: 'tabs', text: '文章、组件、自定义页面在这切换，隐藏文章=已发布但不在BLOG首页显示。' },
  { anchor: 'view-tools', text: '可在此处切换视图并使用日历进行筛选' },
  { anchor: 'gallery-bar', text: '此处显示你的BLOG剩余存储空间。' },
  { anchor: 'theme-switch', text: '此处可以更换BLOG主题，前期确定好主题后期不要轻易更换，否则容易导致主题BUG！' },
]

const HIGHLIGHT_PAD = 6
const HIGHLIGHT_RADIUS = 8
const BUBBLE_GAP = 12
const BUBBLE_WIDTH = 340
const VIEWPORT_MARGIN = 8
const OVERLAY_Z_INDEX = 10100
const RESIZE_DEBOUNCE_MS = 150

function clamp(value, min, max) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.min(Math.max(value, lo), hi)
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (_) {
    return false
  }
}

function findTourAnchor(anchor) {
  try {
    return document.querySelector(`[data-tour="${anchor}"]`)
  } catch (_) {
    return null
  }
}

function readRect(el) {
  const rect = el.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

const OnboardingTour = ({ open, onClose, steps }) => {
  const [activeIdx, setActiveIdx] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [bubbleHeight, setBubbleHeight] = useState(0)
  const bubbleRef = useRef(null)
  const rafRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const total = Array.isArray(steps) ? steps.length : 0

  const scheduleReposition = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
      if (!step) return
      const el = findTourAnchor(step.anchor)
      if (!el) return
      setTargetRect(readRect(el))
    })
  }, [activeIdx, steps, total])

  // R16F F2：完整重定位（每步定位与 resize 稳定后共用）：
  // scrollIntoView 居中（try/catch）→ 双 rAF 等布局定稿 → 测量 → setTargetRect
  const repositionStep = useCallback((step) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!step || !step.anchor) return
        const el = findTourAnchor(step.anchor)
        if (!el) return
        try {
          el.scrollIntoView({ block: 'center' })
        } catch (_) {
          /* 定位失败则按当前视口位置测量 */
        }
        const rect = readRect(el)
        if (rect) setTargetRect(rect)
      })
    })
  }, [])

  // 打开时重置到第一步
  useEffect(() => {
    if (open) {
      setActiveIdx(0)
      setTargetRect(null)
      setBubbleHeight(0)
    }
  }, [open])

  // 每步定位：scrollIntoView 居中后测量；目标缺失/零尺寸自动跳步；越界（全部缺失）关闭
  // R16F F2：定位本体抽到 repositionStep（scrollIntoView → 双 rAF → 测量）
  useEffect(() => {
    if (!open) return
    if (total === 0 || activeIdx >= total) {
      if (closeRef.current) closeRef.current()
      return
    }
    const step = steps[activeIdx]
    if (!step || !step.anchor) {
      setActiveIdx((i) => i + 1)
      return
    }
    let cancelled = false
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (cancelled) return
      const el = findTourAnchor(step.anchor)
      if (!el || !readRect(el)) {
        setActiveIdx((i) => i + 1)
        return
      }
      repositionStep(step)
    })
    return () => {
      cancelled = true
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [open, activeIdx, steps, total, repositionStep])

  // resize / 滚动（含 #admin-container 内部滚动，capture 捕获）重算位置
  // R16F F2：resize 另加 150ms 尾部防抖——布局稳定后做一次完整重定位（含 scrollIntoView）
  useEffect(() => {
    if (!open) return
    let resizeDebounceId = null
    const onResize = () => {
      scheduleReposition()
      if (resizeDebounceId !== null) window.clearTimeout(resizeDebounceId)
      resizeDebounceId = window.setTimeout(() => {
        resizeDebounceId = null
        const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
        if (step) repositionStep(step)
      }, RESIZE_DEBOUNCE_MS)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', scheduleReposition, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', scheduleReposition, true)
      if (resizeDebounceId !== null) {
        window.clearTimeout(resizeDebounceId)
        resizeDebounceId = null
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [open, activeIdx, steps, total, scheduleReposition, repositionStep])

  // R16F F2：目标锚点自身（缺失时退回 #admin-container）尺寸变化 → 同样的完整重定位
  useEffect(() => {
    if (!open || typeof ResizeObserver === 'undefined') return
    const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
    if (!step) return
    const target = findTourAnchor(step.anchor) || document.getElementById('admin-container')
    if (!target) return
    let roDebounceId = null
    const observer = new ResizeObserver(() => {
      if (roDebounceId !== null) window.clearTimeout(roDebounceId)
      roDebounceId = window.setTimeout(() => {
        roDebounceId = null
        repositionStep(step)
      }, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(target)
    return () => {
      observer.disconnect()
      if (roDebounceId !== null) {
        window.clearTimeout(roDebounceId)
        roDebounceId = null
      }
    }
  }, [open, activeIdx, steps, total, repositionStep])

  // Esc = 跳过
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        try {
          if (closeRef.current) closeRef.current()
        } catch (_) {
          /* ignore */
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // 气泡实际高度（决定上方/下方翻转与垂直 clamp）
  useLayoutEffect(() => {
    if (!open || !targetRect) return
    const el = bubbleRef.current
    if (!el) return
    setBubbleHeight(el.offsetHeight)
  }, [open, targetRect, activeIdx])

  if (!open || typeof document === 'undefined' || total === 0) return null

  const idx = Math.min(activeIdx, total - 1)
  const step = steps[idx]
  if (!step) return null

  const vw = window.innerWidth || 1024
  const vh = window.innerHeight || 768
  const bubbleWidth = Math.min(BUBBLE_WIDTH, vw - VIEWPORT_MARGIN * 2)
  const transition = prefersReducedMotion()
    ? 'none'
    : 'top 0.2s ease-out, left 0.2s ease-out, width 0.2s ease-out, height 0.2s ease-out'

  let bubbleLeft = VIEWPORT_MARGIN
  let bubbleTop = VIEWPORT_MARGIN
  if (targetRect) {
    const centerX = targetRect.left + targetRect.width / 2
    bubbleLeft = clamp(
      centerX - bubbleWidth / 2,
      VIEWPORT_MARGIN,
      vw - bubbleWidth - VIEWPORT_MARGIN
    )
    const belowTop = targetRect.top + targetRect.height + BUBBLE_GAP
    if (
      belowTop + bubbleHeight > vh - VIEWPORT_MARGIN &&
      targetRect.top - BUBBLE_GAP - bubbleHeight >= VIEWPORT_MARGIN
    ) {
      bubbleTop = targetRect.top - BUBBLE_GAP - bubbleHeight
    } else {
      bubbleTop = belowTop
    }
    bubbleTop = clamp(bubbleTop, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, vh - bubbleHeight - VIEWPORT_MARGIN))
  }

  const handleNext = () => {
    if (idx >= total - 1) {
      if (closeRef.current) closeRef.current()
      return
    }
    setTargetRect(null)
    setActiveIdx(idx + 1)
  }
  const handlePrev = () => {
    if (idx <= 0) return
    setTargetRect(null)
    setActiveIdx(idx - 1)
  }
  const handleClose = () => {
    if (closeRef.current) closeRef.current()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="新手引导"
      style={{ position: 'fixed', inset: 0, zIndex: OVERLAY_Z_INDEX }}
      onClick={(e) => e.preventDefault()}
    >
      {targetRect ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: targetRect.left - HIGHLIGHT_PAD,
            top: targetRect.top - HIGHLIGHT_PAD,
            width: targetRect.width + HIGHLIGHT_PAD * 2,
            height: targetRect.height + HIGHLIGHT_PAD * 2,
            borderRadius: HIGHLIGHT_RADIUS,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.66)',
            border: '1px solid rgba(255,255,255,0.35)',
            transition,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {targetRect ? (
        <div
          ref={bubbleRef}
          style={{
            position: 'fixed',
            left: bubbleLeft,
            top: bubbleTop,
            width: bubbleWidth,
            background: '#212126',
            border: '1px solid #3a3a40',
            borderRadius: '12px',
            padding: '14px 16px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            transition: prefersReducedMotion() ? 'none' : 'top 0.2s ease-out, left 0.2s ease-out',
          }}
        >
          <div style={{ fontSize: '11px', color: '#999', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '8px' }}>
            {idx + 1}/{total}
          </div>
          <div style={{ fontSize: '13px', lineHeight: '1.7', color: '#f0f0f0' }}>{step.text}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '14px' }}>
            <button
              type="button"
              onClick={handleClose}
              style={{ background: 'transparent', color: '#888', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
            >
              跳过
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              {idx > 0 ? (
                <button
                  type="button"
                  onClick={handlePrev}
                  style={{ background: '#2a2a2e', color: '#ccc', border: '1px solid #555', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  上一步
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleNext}
                style={{ background: '#fff', color: '#111', border: 'none', padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {idx >= total - 1 ? '完成' : '下一步'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  )
}

export default OnboardingTour
