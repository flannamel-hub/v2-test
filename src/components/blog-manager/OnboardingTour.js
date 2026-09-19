/** R16：后台新手聚焦引导（10 步，遮罩挖孔 + 小气泡；第 10 步为交互步：强制点击「发布新内容」）。
 * 手写零依赖：createPortal 挂 document.body（后台在 #admin-container z-index:9999 内，
 * 必须脱离该层叠上下文），引导层 z-index:10100 压过后台一切弹层。
 * 挖孔法：单个 fixed div 定位在目标 rect（外扩 6px、圆角 8）+ box-shadow 0 0 0 9999px 遮罩。
 * 行为：每步先 scrollIntoView({block:'center'}) 再定位；resize/scroll 重算；
 * 目标缺失或零尺寸自动跳过该步；Esc=跳过；prefers-reduced-motion 去过渡。
 * R16G：扩展至 10 步；第 10 步为交互步（interactive:true）——遮罩不拦截、挖孔点击穿透到
 * 真实按钮、挖孔外 4 块捕获层防误触（仅 preventDefault）、呼吸光晕+双错相涟漪引导动画
 * （keyframes 注入 <style>，r16tour- 前缀防撞，reduced-motion 降级静态光晕）、
 * 目标按钮 capture click 命中即走既有 close 流程（不 preventDefault）、交互步 Esc 屏蔽、
 * 交互步目标缺失直接关闭。
 * R18（编辑器引导增强，仅新增能力、既有首页 10 步行为零改动）：
 * - 可选 prop onStepChange(index, step)：每步定位 effect 内、reposition 前调用（父层用于
 *   展开/收起编辑器步骤）；不传则行为与旧版完全一致。
 * - onClose(reason)：所有关闭路径带 reason——跳过按钮/Esc='skip'；末步「完成/下一步」=
 *   'done'；交互步点击真实按钮命中='interactive'；异常兜底='skip'。父层可忽略该参数（向后兼容）。
 * - 长目标（高度 > 视口 80%）：scrollIntoView({block:'start'}) 顶对齐（其余仍 center），
 *   且气泡改放目标顶部内侧（top = targetRect.top + 16，水平仍居中+视口钳制），避免气泡被
 *   钳到屏幕底部。
 * - 步进稳定复测：每步定位后 +300ms 再执行一次完整 reposition（防手风琴展开动画期间测量错位）。 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const TOUR_STEPS = [
  { anchor: 'site-info', text: '这是你的站点标题，点击标题文字可重命名。' },
  { anchor: 'publish', text: '写文章、发布内容，都从这里开始。' },
  { anchor: 'tabs', text: '文章、组件、自定义页面在这切换，隐藏文章=已发布但不在BLOG首页显示。' },
  { anchor: 'view-tools', text: '可在此处切换视图并使用日历进行筛选' },
  { anchor: 'gallery-bar', text: '此处显示你的BLOG剩余存储空间。' },
  { anchor: 'theme-switch', text: '此处可以更换BLOG主题，前期确定好主题后期不要轻易更换，否则容易导致主题BUG！' },
  { anchor: 'refresh', text: '发布新文章或更新内容后点击刷新按钮可以让你更新的内容更快出现在网站中' },
  { anchor: 'drafts', text: '编辑到一半的文章会暂时保存在草稿箱' },
  { anchor: 'trash', text: '删除的文章会被暂时保存在垃圾箱' },
  { anchor: 'publish', text: '那么从发布你的第一篇文章开始吧', interactive: true },
]

const HIGHLIGHT_PAD = 6
const HIGHLIGHT_RADIUS = 8
const BUBBLE_GAP = 12
const BUBBLE_WIDTH = 340
const VIEWPORT_MARGIN = 8
const OVERLAY_Z_INDEX = 10100
const RESIZE_DEBOUNCE_MS = 150
// R18：长目标阈值（高度 > 视口 80%）与气泡顶部内侧缩进
const LONG_TARGET_VIEWPORT_RATIO = 0.8
const LONG_TARGET_BUBBLE_INSET = 16
// R18：步进/展开布局变化后的稳定复测延时（手风琴动画约 0.32s，300ms 后再测一次）
const STEP_STABILITY_RECHECK_MS = 300
// R16G G2：交互步点击引导动画（呼吸光晕 + 双错相涟漪，约 1.8s 循环）
const RIPPLE_BORDER = '2px solid rgba(255,255,255,0.5)'
const RIPPLE_ANIM_MS = 1800
const RIPPLE_DELAY_MS = 900
const GLOW_SHADOW_STATIC = '0 0 0 4px rgba(255,255,255,0.45), 0 0 22px 6px rgba(255,255,255,0.28)'

// R16G G2：动画 keyframes 注入 <style>（仅注册一次；类名 r16tour- 前缀防撞；
// reduced-motion 时 CSS 与 JS 双保险降级为静态光晕、无循环动画）
const TOUR_STYLE_ID = 'r16tour-style'
let tourStyleRegistered = false
function ensureTourStyle() {
  if (tourStyleRegistered || typeof document === 'undefined') return
  try {
    if (document.getElementById(TOUR_STYLE_ID)) {
      tourStyleRegistered = true
      return
    }
    const style = document.createElement('style')
    style.id = TOUR_STYLE_ID
    style.textContent = [
      '@keyframes r16tour-glow{0%,100%{box-shadow:0 0 0 4px rgba(255,255,255,0.45),0 0 22px 6px rgba(255,255,255,0.28)}50%{box-shadow:0 0 0 2px rgba(255,255,255,0.20),0 0 10px 2px rgba(255,255,255,0.12)}}',
      '@keyframes r16tour-ripple{0%{transform:scale(1);opacity:0.85}100%{transform:scale(1.35);opacity:0}}',
      `.r16tour-glow{animation:r16tour-glow ${RIPPLE_ANIM_MS}ms ease-in-out infinite}`,
      `.r16tour-ripple{animation:r16tour-ripple ${RIPPLE_ANIM_MS}ms ease-out infinite}`,
      `.r16tour-ripple-delay{animation-delay:${RIPPLE_DELAY_MS}ms}`,
      '@media (prefers-reduced-motion: reduce){.r16tour-glow,.r16tour-ripple{animation:none}}',
    ].join('\n')
    document.head.appendChild(style)
    tourStyleRegistered = true
  } catch (_) {
    /* 样式注入失败则无动画，引导仍可用 */
  }
}

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

const OnboardingTour = ({ open, onClose, onStepChange, steps }) => {
  const [activeIdx, setActiveIdx] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [bubbleHeight, setBubbleHeight] = useState(0)
  const bubbleRef = useRef(null)
  const rafRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // R18：onStepChange 经 ref 调用（父层回调 identity 变化不需要重跑定位 effect）
  const stepChangeRef = useRef(onStepChange)
  stepChangeRef.current = onStepChange

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
  // R18：长目标（高度 > 视口 80%）改 block:'start' 顶对齐滚屏（气泡由渲染层放目标顶部内侧）
  const repositionStep = useCallback((step) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!step || !step.anchor) return
        const el = findTourAnchor(step.anchor)
        if (!el) return
        try {
          const vh = window.innerHeight || 0
          const isLongTarget = vh > 0 && el.offsetHeight > vh * LONG_TARGET_VIEWPORT_RATIO
          el.scrollIntoView({ block: isLongTarget ? 'start' : 'center' })
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
  // R18：①reposition 前调 onStepChange(index, step)（可选；父层展开/收起编辑器步骤）；
  // ②关闭路径带 reason（越界兜底='skip'、交互步锚点缺失='skip'）；③+300ms 稳定复测一次
  useEffect(() => {
    if (!open) return
    if (total === 0 || activeIdx >= total) {
      if (closeRef.current) closeRef.current('skip')
      return
    }
    const step = steps[activeIdx]
    if (!step || !step.anchor) {
      setActiveIdx((i) => i + 1)
      return
    }
    let cancelled = false
    let stabilityTimer = null
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (cancelled) return
      const el = findTourAnchor(step.anchor)
      if (!el || !readRect(el)) {
        if (step.interactive) {
          // R16G G2：交互步目标锚点缺失 → 直接关闭（走既有 close 流程）
          if (closeRef.current) closeRef.current('skip')
          return
        }
        setActiveIdx((i) => i + 1)
        return
      }
      // R18：每步定位 effect 内、reposition 前通知父层（不传则跳过，首页引导行为不变）
      try {
        if (stepChangeRef.current) stepChangeRef.current(activeIdx, step)
      } catch (_) {
        /* 父层回调失败不影响引导定位 */
      }
      repositionStep(step)
      // R18：步进/展开导致布局变化后 +300ms 再复测一次（防展开动画期间测量错位）
      stabilityTimer = window.setTimeout(() => {
        if (!cancelled) repositionStep(step)
      }, STEP_STABILITY_RECHECK_MS)
    })
    return () => {
      cancelled = true
      if (stabilityTimer !== null) {
        window.clearTimeout(stabilityTimer)
        stabilityTimer = null
      }
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

  // Esc = 跳过（R16G G2：交互步屏蔽 Esc，必须点击目标按钮才算完成；R18：close 带 reason='skip'）
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
      if (step && step.interactive) return
      try {
        if (closeRef.current) closeRef.current('skip')
      } catch (_) {
        /* ignore */
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, activeIdx, steps, total])

  // R16G G2：交互步完成判定——对目标按钮 capture 挂 click，命中即走既有 close 流程
  // （不 preventDefault，按钮自身的进编辑器逻辑照常执行）；
  // 步进 / 关闭 / 卸载均经此 effect 的 cleanup removeEventListener
  // R18：close 带 reason='interactive'（首页引导据此置链式标记，接续编辑器引导）
  useEffect(() => {
    if (!open) return
    const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
    if (!step || !step.interactive) return
    const el = findTourAnchor(step.anchor)
    if (!el) return
    const onTargetClick = () => {
      try {
        if (closeRef.current) closeRef.current('interactive')
      } catch (_) {
        /* ignore */
      }
    }
    el.addEventListener('click', onTargetClick, true)
    return () => el.removeEventListener('click', onTargetClick, true)
  }, [open, activeIdx, steps, total])

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
  const isInteractive = !!step.interactive
  const reduced = prefersReducedMotion()
  // R16G G2：交互步渲染前确保动画 keyframes 已注册（客户端组件，幂等）
  if (isInteractive) ensureTourStyle()

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
    // R18：长目标（高度 > 视口 80%）气泡改放目标顶部内侧，避免被钳到屏幕底部
    const isLongTarget = targetRect.height > vh * LONG_TARGET_VIEWPORT_RATIO
    if (isLongTarget) {
      bubbleTop = targetRect.top + LONG_TARGET_BUBBLE_INSET
    } else {
      const belowTop = targetRect.top + targetRect.height + BUBBLE_GAP
      if (
        belowTop + bubbleHeight > vh - VIEWPORT_MARGIN &&
        targetRect.top - BUBBLE_GAP - bubbleHeight >= VIEWPORT_MARGIN
      ) {
        bubbleTop = targetRect.top - BUBBLE_GAP - bubbleHeight
      } else {
        bubbleTop = belowTop
      }
    }
    bubbleTop = clamp(bubbleTop, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, vh - bubbleHeight - VIEWPORT_MARGIN))
  }

  const handleNext = () => {
    if (idx >= total - 1) {
      if (closeRef.current) closeRef.current('done')
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
    if (closeRef.current) closeRef.current('skip')
  }
  // R16G G2：捕获层点击只 preventDefault 防误触（不冒泡处理、不拦截真实按钮）
  const blockClick = (e) => {
    e.preventDefault()
  }

  // R16G G2：交互步挖孔几何（遮罩不拦截；挖孔外由 4 块捕获层防误触）
  let cutLeft = 0
  let cutTop = 0
  let cutRight = 0
  let cutBottom = 0
  let cutWidth = 0
  let cutHeight = 0
  if (targetRect) {
    cutLeft = targetRect.left - HIGHLIGHT_PAD
    cutTop = targetRect.top - HIGHLIGHT_PAD
    cutWidth = targetRect.width + HIGHLIGHT_PAD * 2
    cutHeight = targetRect.height + HIGHLIGHT_PAD * 2
    cutRight = cutLeft + cutWidth
    cutBottom = cutTop + cutHeight
  }
  const captureBlocks = targetRect
    ? [
        { left: 0, top: 0, width: vw, height: Math.max(0, cutTop) },
        { left: 0, top: cutBottom, width: vw, height: Math.max(0, vh - cutBottom) },
        { left: 0, top: cutTop, width: Math.max(0, cutLeft), height: cutHeight },
        { left: cutRight, top: cutTop, width: Math.max(0, vw - cutRight), height: cutHeight },
      ]
    : []
  const cutoutBaseStyle = {
    position: 'fixed',
    left: cutLeft,
    top: cutTop,
    width: cutWidth,
    height: cutHeight,
    borderRadius: HIGHLIGHT_RADIUS,
    pointerEvents: 'none',
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="新手引导"
      style={{ position: 'fixed', inset: 0, zIndex: OVERLAY_Z_INDEX, ...(isInteractive ? { pointerEvents: 'none' } : null) }}
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
      {/* R16G G2：交互步点击引导动画——呼吸光晕 + 2 个错相涟漪环（全部 pointer-events none，挖孔可点击穿透） */}
      {targetRect && isInteractive ? (
        <>
          <div
            aria-hidden="true"
            className={reduced ? undefined : 'r16tour-glow'}
            style={{
              ...cutoutBaseStyle,
              ...(reduced ? { boxShadow: GLOW_SHADOW_STATIC } : null),
            }}
          />
          {reduced
            ? null
            : [0, 1].map((i) => (
                <div
                  key={`r16tour-ripple-${i}`}
                  aria-hidden="true"
                  className={i === 1 ? 'r16tour-ripple r16tour-ripple-delay' : 'r16tour-ripple'}
                  style={{
                    ...cutoutBaseStyle,
                    border: RIPPLE_BORDER,
                    boxSizing: 'border-box',
                    transformOrigin: 'center',
                  }}
                />
              ))}
        </>
      ) : null}
      {/* R16G G2：交互步遮罩不拦截，挖孔外 4 块捕获层（pointerEvents auto）防误触：点击仅 preventDefault */}
      {targetRect && isInteractive
        ? captureBlocks.map((block, i) => (
            <div
              key={`r16tour-cap-${i}`}
              onClick={blockClick}
              style={{ position: 'fixed', ...block, pointerEvents: 'auto' }}
            />
          ))
        : null}
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
            ...(isInteractive ? { pointerEvents: 'none' } : null),
          }}
        >
          <div style={{ fontSize: '11px', color: '#999', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '8px' }}>
            {idx + 1}/{total}
          </div>
          <div style={{ fontSize: '13px', lineHeight: '1.7', color: '#f0f0f0' }}>{step.text}</div>
          {/* R16G G2：交互步气泡不渲染任何按钮（跳过/上一步/下一步/完成） */}
          {isInteractive ? null : (
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
          )}
        </div>
      ) : null}
    </div>,
    document.body
  )
}

export default OnboardingTour
