/** R16：后台新手聚焦引导（10 步；第 10 步为交互步：强制点击「发布新内容」）。
 * 手写零依赖：createPortal 挂 document.body（后台在 #admin-container z-index:9999 内，
 * 必须脱离该层叠上下文），引导层 z-index:10100 压过后台一切弹层。
 * R16G G2：交互步（interactive:true）——点击穿透（容器 pointerEvents none + 框外捕获层）、
 * 呼吸光晕+双错相涟漪引导动画（keyframes 注入 <style>，r16tour- 前缀防撞，reduced-motion
 * 降级静态光晕）、目标按钮 capture click 命中即走既有 close 流程（不 preventDefault）、
 * 交互步目标缺失直接关闭。
 * R18：- 可选 prop onStepChange(index, step)：每步「动作先行」阶段调用（父层用于展开/收起
 *   编辑器步骤）；不传则行为与首页引导一致（仅滚屏）。
 *   - onClose(reason)：所有关闭路径带 reason——跳过/Esc/退出确认='skip'；末步「完成/下一步」=
 *   'done'；交互步点击真实按钮命中='interactive'；异常兜底='skip'。父层可忽略该参数（向后兼容）。
 *   - 长目标（高度 > 视口 80%）：scrollIntoView({block:'start'}) 顶对齐（其余 center），
 *     且气泡改放目标顶部内侧（top = targetRect.top + 16）。
 * R18X（阶段化编排重做，视觉层-only；步骤文案/锚点/close reason 契约零改动）：
 *   - 每步五阶段：①全亮（遮罩 opacity 0、框隐藏；动作先行=onStepChange+瞬时 scrollIntoView）
 *     → ②等待布局 ~500ms（手风琴展开 ~0.32s+余量，setTimeout 静置）→ ③缓缓变暗+聚焦
 *     （遮罩 opacity 0→0.5 + 描边框 2px 白描边/圆角 10/轻微外发光，transform
 *     translate+scale 自目标中心 1.12 收拢至 1，~480ms；气泡同步淡入，位置按此刻 rect）
 *     → ④holding（此阶段才显示并启用 上一步/下一步/完成；resize/scroll 重测仅此阶段生效、
 *     即时更新不加过渡）→ ⑤点击下一步：框淡出+画面变亮 ~350ms → 进入下一聚焦（上一步同机制）。
 *     不再使用 box-shadow 挖孔；禁止 width/height/left/top 过渡（仅 transform/opacity）。
 * R19F（聚焦显示修复，视觉层-only）：均匀遮罩改「evenodd clip-path 圆角挖孔」——被聚焦目标
 *   区域保持全亮，其余屏幕 0.5 变暗；挖孔几何**瞬时更新、不参与任何过渡**（切步/滚屏重测时遮罩
 *   opacity=0 或正在淡入，无位移 smear），R18X 全部编排/防抖动特性保留；非交互步在挖孔区补
 *   透明捕获层防误触（交互步不渲染，保留点击穿透）。
 *   - prefers-reduced-motion：所有过渡时长=0（直接显示变暗后/定位后视图）。
 *   - 交互步：holding 阶段沿用「点击穿透+捕获层+呼吸光晕+涟漪+点目标按钮即完成」机制；
 *     不同处仅底色遮罩带挖孔半透明（聚焦区全亮）、聚焦框样式统一（描边+光晕）。
 *   - 退出机制（§二）：左下角「退出新手指引」文字按钮 / Esc（含交互步，旧屏蔽行为取消）/
 *     工具条「跳过」三条路径统一先弹页内确认窗（引导层级内 z 最高）：「确认退出」=close('skip')、
 *     「继续引导」/点遮罩/Esc=关窗继续；确认窗打开期间 上一步/下一步/完成 不可用。 */
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
// R18X：聚焦框=仅描边（2px 白描边 + 圆角 10 + 轻微外发光），不再 box-shadow 挖孔
const FOCUS_BORDER = '2px solid rgba(255,255,255,0.92)'
const FOCUS_RADIUS = 10
const FOCUS_GLOW = '0 0 16px 4px rgba(255,255,255,0.22)'
// R18X：阶段化编排时长（reduced-motion 时过渡时长=0）
const MASK_DIMMED_OPACITY = 0.5
const LAYOUT_SETTLE_MS = 500
const FOCUS_IN_MS = 480
const BRIGHTEN_MS = 350
const FOCUS_ENTER_SCALE = 1.12
const BUBBLE_GAP = 12
const BUBBLE_WIDTH = 340
const VIEWPORT_MARGIN = 8
const OVERLAY_Z_INDEX = 10100
const RESIZE_DEBOUNCE_MS = 150
// R18：长目标阈值（高度 > 视口 80%）与气泡顶部内侧缩进
const LONG_TARGET_VIEWPORT_RATIO = 0.8
const LONG_TARGET_BUBBLE_INSET = 16
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
  // R18X：聚焦框四态——hidden(不渲染)/enter(初始 1.12 倍+透明)/shown(收拢至 1+不透明)/leave(退场淡出)
  const [frameState, setFrameState] = useState('hidden')
  const [dimmed, setDimmed] = useState(false)
  const [holding, setHolding] = useState(false)
  // R18X：退出二次确认窗（三条退出路径统一先经此窗）
  const [confirmOpen, setConfirmOpen] = useState(false)
  const bubbleRef = useRef(null)
  const rafRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // R18：onStepChange 经 ref 调用（父层回调 identity 变化不需要重跑定位 effect）
  const stepChangeRef = useRef(onStepChange)
  stepChangeRef.current = onStepChange
  // R18X：holding/confirmOpen 镜像 ref（滚动等监听内读取，避免闭包过期）
  const holdingRef = useRef(false)
  holdingRef.current = holding
  const confirmOpenRef = useRef(false)
  confirmOpenRef.current = confirmOpen
  // R18X：步进退场（变亮）定时器（事件处理器内启动，需组件级持有并在关闭/卸载时清理）
  const navTimerRef = useRef(null)

  const total = Array.isArray(steps) ? steps.length : 0

  const clearNavTimer = () => {
    if (navTimerRef.current !== null) {
      window.clearTimeout(navTimerRef.current)
      navTimerRef.current = null
    }
  }

  // R18X：holding 阶段的完整重定位（resize 稳定后用；含瞬时 scrollIntoView + 双 rAF 测量）
  const fullReposition = useCallback((step) => {
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
          el.scrollIntoView(isLongTarget ? { block: 'start' } : { block: 'center' })
        } catch (_) {
          /* 定位失败则按当前视口位置测量 */
        }
        const rect = readRect(el)
        if (rect) setTargetRect(rect)
      })
    })
  }, [])

  // 打开时重置到第一步（R18X：连同阶段态一起复位）；关闭/卸载时清步进定时器
  useEffect(() => {
    if (open) {
      setActiveIdx(0)
      setTargetRect(null)
      setBubbleHeight(0)
      setFrameState('hidden')
      setDimmed(false)
      setHolding(false)
      setConfirmOpen(false)
    }
    if (!open) {
      setConfirmOpen(false)
      clearNavTimer()
    }
  }, [open])
  useEffect(() => () => clearNavTimer(), [])

  // R18X：每步阶段化编排（§一）。
  // 阶段1（全亮+动作先行）→ 阶段2（布局静置 LAYOUT_SETTLE_MS）→ 阶段3（变暗+聚焦，
  // transform 收拢 1.12→1）→ 阶段4（holding 启用按钮）。
  // 目标缺失/零尺寸自动跳步；越界（全部缺失）关闭='skip'；交互步锚点缺失直接关闭='skip'。
  // onStepChange 与瞬时 scrollIntoView 均在阶段 1（reposition 前）执行（R18「动作先行」落点）。
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
    const reduced = prefersReducedMotion()
    let cancelled = false
    const timers = []
    let innerRaf = null
    const stopAll = () => {
      timers.forEach((id) => window.clearTimeout(id))
      timers.length = 0
      if (innerRaf !== null) {
        cancelAnimationFrame(innerRaf)
        innerRaf = null
      }
    }
    // 阶段1：遮罩全亮、聚焦框隐藏；动作先执行
    setDimmed(false)
    setFrameState('hidden')
    setHolding(false)
    setTargetRect(null)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (cancelled) return
      const el = findTourAnchor(step.anchor)
      if (!el || !readRect(el)) {
        // R16G G2：交互步目标锚点缺失 → 直接关闭（走既有 close 流程）
        if (step.interactive) {
          if (closeRef.current) closeRef.current('skip')
          return
        }
        setActiveIdx((i) => i + 1)
        return
      }
      // R18：动作先行——每步定位前通知父层（不传则跳过，首页引导行为不变）
      try {
        if (stepChangeRef.current) stepChangeRef.current(activeIdx, step)
      } catch (_) {
        /* 父层回调失败不影响引导定位 */
      }
      // 动作先行：瞬时滚屏（默认 auto=瞬时；长目标顶对齐）
      try {
        const vh = window.innerHeight || 0
        const isLongTarget = vh > 0 && el.offsetHeight > vh * LONG_TARGET_VIEWPORT_RATIO
        el.scrollIntoView(isLongTarget ? { block: 'start' } : { block: 'center' })
      } catch (_) {
        /* 定位失败则按静置后视口位置测量 */
      }
      // 阶段2：动作后静置 ~500ms 再测量（手风琴展开动画 ~0.32s + 余量；不用 rAF 链）
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          const elNow = findTourAnchor(step.anchor)
          const rect = elNow ? readRect(elNow) : null
          if (!rect) {
            if (step.interactive) {
              if (closeRef.current) closeRef.current('skip')
              return
            }
            setActiveIdx((i) => i + 1)
            return
          }
          // 阶段3：缓缓变暗（均匀遮罩 0→0.5）+ 聚焦（描边框自中心 1.12 收拢至 1）；气泡同步淡入
          setTargetRect(rect)
          setDimmed(true)
          setFrameState('enter')
          if (reduced) {
            // prefers-reduced-motion：过渡时长=0，直接显示变暗后/定位后视图
            setFrameState('shown')
            timers.push(
              window.setTimeout(() => {
                if (!cancelled) setHolding(true)
              }, 0)
            )
          } else {
            innerRaf = requestAnimationFrame(() => {
              innerRaf = requestAnimationFrame(() => {
                innerRaf = null
                if (cancelled) return
                setFrameState('shown')
              })
            })
            // 阶段4：过渡结束后进入 holding（此阶段才显示并启用 上一步/下一步/完成）
            timers.push(
              window.setTimeout(() => {
                if (!cancelled) setHolding(true)
              }, FOCUS_IN_MS)
            )
          }
        }, LAYOUT_SETTLE_MS)
      )
    })
    return () => {
      cancelled = true
      stopAll()
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [open, activeIdx, steps, total])

  // R18X：resize / 滚动（含 #admin-container 内部滚动，capture 捕获）重测——仅 holding 阶段
  // 生效，即时更新（不加过渡）；resize 另加 150ms 尾部防抖做一次完整重定位（含 scrollIntoView）
  useEffect(() => {
    if (!open) return
    const reMeasure = () => {
      const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
      if (!step) return
      const el = findTourAnchor(step.anchor)
      if (!el) return
      setTargetRect(readRect(el))
    }
    const scheduleReposition = () => {
      if (!holdingRef.current) return
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        reMeasure()
      })
    }
    let resizeDebounceId = null
    const onResize = () => {
      if (!holdingRef.current) return
      scheduleReposition()
      if (resizeDebounceId !== null) window.clearTimeout(resizeDebounceId)
      resizeDebounceId = window.setTimeout(() => {
        resizeDebounceId = null
        if (!holdingRef.current) return
        const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
        if (step) fullReposition(step)
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
  }, [open, activeIdx, steps, total, fullReposition])

  // R18X：目标锚点自身（缺失时退回 #admin-container）尺寸变化 → holding 阶段完整重定位
  useEffect(() => {
    if (!open || !holding || typeof ResizeObserver === 'undefined') return
    const step = total > 0 ? steps[Math.min(activeIdx, total - 1)] : null
    if (!step) return
    const target = findTourAnchor(step.anchor) || document.getElementById('admin-container')
    if (!target) return
    let roDebounceId = null
    const observer = new ResizeObserver(() => {
      if (!holdingRef.current) return
      if (roDebounceId !== null) window.clearTimeout(roDebounceId)
      roDebounceId = window.setTimeout(() => {
        roDebounceId = null
        fullReposition(step)
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
  }, [open, holding, activeIdx, steps, total, fullReposition])

  // R18X（§二）：Esc=任何步骤（含交互步，旧屏蔽行为取消）→ 打开退出确认窗；
  // 确认窗已打开时 Esc=关闭确认窗（继续引导）
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      try {
        if (confirmOpenRef.current) {
          setConfirmOpen(false)
        } else {
          setConfirmOpen(true)
        }
      } catch (_) {
        /* ignore */
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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

  // R18X：聚焦框几何（无过渡，holding 阶段重测即时更新）
  let frameLeft = 0
  let frameTop = 0
  let frameWidth = 0
  let frameHeight = 0
  if (targetRect) {
    frameLeft = targetRect.left - HIGHLIGHT_PAD
    frameTop = targetRect.top - HIGHLIGHT_PAD
    frameWidth = targetRect.width + HIGHLIGHT_PAD * 2
    frameHeight = targetRect.height + HIGHLIGHT_PAD * 2
  }
  const frameRendered = !!targetRect && frameState !== 'hidden'
  // R19F：遮罩挖孔（evenodd 圆角矩形孔；几何瞬时更新，不进 transition）——孔=聚焦框矩形
  let maskClipPath = 'none'
  if (targetRect) {
    const x1 = frameLeft
    const y1 = frameTop
    const x2 = frameLeft + frameWidth
    const y2 = frameTop + frameHeight
    const rr = Math.max(0, Math.min(FOCUS_RADIUS, frameWidth / 2, frameHeight / 2))
    maskClipPath =
      `path(evenodd, "M 0 0 H ${vw} V ${vh} H 0 Z ` +
      `M ${x1 + rr} ${y1} H ${x2 - rr} A ${rr} ${rr} 0 0 1 ${x2} ${y1 + rr} ` +
      `V ${y2 - rr} A ${rr} ${rr} 0 0 1 ${x2 - rr} ${y2} H ${x1 + rr} ` +
      `A ${rr} ${rr} 0 0 1 ${x1} ${y2 - rr} V ${y1 + rr} ` +
      `A ${rr} ${rr} 0 0 1 ${x1 + rr} ${y1} Z")`
  }
  // R18X：框过渡——enter: 1.12 倍+透明 → shown: 收拢至 1+不透明（480ms）；leave: 淡出（350ms）
  let frameTransform = 'scale(1)'
  let frameOpacity = 1
  let frameDuration = FOCUS_IN_MS
  if (frameState === 'enter') {
    frameTransform = `scale(${FOCUS_ENTER_SCALE})`
    frameOpacity = 0
  } else if (frameState === 'leave') {
    frameOpacity = 0
    frameDuration = BRIGHTEN_MS
  }
  const frameTransition = reduced
    ? 'none'
    : `transform ${frameDuration}ms ease-out, opacity ${frameDuration}ms ease-out`

  // R18X：均匀遮罩——变暗 480ms / 变亮 350ms（方向决定时长）
  const maskOpacity = dimmed ? MASK_DIMMED_OPACITY : 0
  const maskTransition = reduced ? 'none' : `opacity ${dimmed ? FOCUS_IN_MS : BRIGHTEN_MS}ms ease`

  // 气泡位置（按阶段 3 测得的 rect 计算；长目标放目标顶部内侧）
  let bubbleLeft = VIEWPORT_MARGIN
  let bubbleTop = VIEWPORT_MARGIN
  if (targetRect) {
    const centerX = targetRect.left + targetRect.width / 2
    bubbleLeft = clamp(
      centerX - bubbleWidth / 2,
      VIEWPORT_MARGIN,
      vw - bubbleWidth - VIEWPORT_MARGIN
    )
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
  // 气泡透明度与框同步淡入/淡出；位置无过渡（即时更新）
  const bubbleOpacity = frameState === 'shown' ? 1 : 0
  const bubbleDuration = frameState === 'leave' ? BRIGHTEN_MS : FOCUS_IN_MS
  const bubbleTransition = reduced ? 'none' : `opacity ${bubbleDuration}ms ease-out`

  // R18X（§二）：三条退出路径（Esc/左下角按钮/跳过）统一确认窗；holding 之外/确认窗打开期间按钮不可用
  const navDisabled = !holding || confirmOpen
  const requestExit = () => {
    if (!confirmOpenRef.current) setConfirmOpen(true)
  }
  const continueTour = () => setConfirmOpen(false)
  const confirmExit = () => {
    setConfirmOpen(false)
    try {
      if (closeRef.current) closeRef.current('skip')
    } catch (_) {
      /* ignore */
    }
  }
  // R18X：步进=先退场（框淡出+画面变亮 ~350ms）再进入下一聚焦（上一步同机制）
  const gotoStep = (nextIdx) => {
    const reducedNow = prefersReducedMotion()
    setHolding(false)
    setDimmed(false)
    setFrameState('leave')
    clearNavTimer()
    navTimerRef.current = window.setTimeout(() => {
      navTimerRef.current = null
      setTargetRect(null)
      setFrameState('hidden')
      setActiveIdx(nextIdx)
    }, reducedNow ? 0 : BRIGHTEN_MS)
  }
  const handleNext = () => {
    if (navDisabled) return
    if (idx >= total - 1) {
      if (closeRef.current) closeRef.current('done')
      return
    }
    gotoStep(idx + 1)
  }
  const handlePrev = () => {
    if (navDisabled || idx <= 0) return
    gotoStep(idx - 1)
  }
  // R16G G2：捕获层点击只 preventDefault 防误触（不冒泡处理、不拦截真实按钮）
  const blockClick = (e) => {
    e.preventDefault()
  }

  // R16G G2：交互步捕获层几何（聚焦框外 4 块防误触；holding 阶段渲染）
  const interactiveHolding = isInteractive && holding && !!targetRect
  let cutRight = 0
  let cutBottom = 0
  if (interactiveHolding) {
    cutRight = frameLeft + frameWidth
    cutBottom = frameTop + frameHeight
  }
  const captureBlocks = interactiveHolding
    ? [
        { left: 0, top: 0, width: vw, height: Math.max(0, frameTop) },
        { left: 0, top: cutBottom, width: vw, height: Math.max(0, vh - cutBottom) },
        { left: 0, top: frameTop, width: Math.max(0, frameLeft), height: frameHeight },
        { left: cutRight, top: frameTop, width: Math.max(0, vw - cutRight), height: frameHeight },
      ]
    : []
  const focusFrameBaseStyle = {
    position: 'fixed',
    left: frameLeft,
    top: frameTop,
    width: frameWidth,
    height: frameHeight,
    borderRadius: FOCUS_RADIUS,
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
      {/* R19F：全屏半透明遮罩 + evenodd 圆角挖孔（聚焦区域全亮；挖孔几何瞬时更新、不加过渡） */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          opacity: maskOpacity,
          transition: maskTransition,
          clipPath: maskClipPath,
          WebkitClipPath: maskClipPath,
          pointerEvents: isInteractive ? 'none' : 'auto',
        }}
      />
      {/* R19F：非交互步——挖孔区透明捕获层（挖孔后遮罩不再覆盖该区，防误触目标；交互步不渲染，保留点击穿透） */}
      {frameRendered && !isInteractive ? (
        <div
          aria-hidden="true"
          onClick={blockClick}
          style={{
            position: 'fixed',
            left: frameLeft,
            top: frameTop,
            width: frameWidth,
            height: frameHeight,
            borderRadius: FOCUS_RADIUS,
            pointerEvents: 'auto',
          }}
        />
      ) : null}
      {/* R18X：聚焦框——仅描边（2px 白描边+圆角 10+轻微外发光），transform 收拢动画（禁止 left/top/width/height 过渡） */}
      {frameRendered ? (
        <div
          aria-hidden="true"
          style={{
            ...focusFrameBaseStyle,
            border: FOCUS_BORDER,
            boxShadow: FOCUS_GLOW,
            boxSizing: 'border-box',
            transform: frameTransform,
            opacity: frameOpacity,
            transition: frameTransition,
          }}
        />
      ) : null}
      {/* R16G G2：交互步点击引导动画——呼吸光晕 + 2 个错相涟漪环（holding 阶段；全部 pointer-events none，可点击穿透） */}
      {interactiveHolding ? (
        <>
          <div
            aria-hidden="true"
            className={reduced ? undefined : 'r16tour-glow'}
            style={{
              ...focusFrameBaseStyle,
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
                    ...focusFrameBaseStyle,
                    border: RIPPLE_BORDER,
                    boxSizing: 'border-box',
                    transformOrigin: 'center',
                  }}
                />
              ))}
        </>
      ) : null}
      {/* R16G G2：交互步遮罩不拦截，聚焦框外 4 块捕获层（pointerEvents auto）防误触：点击仅 preventDefault */}
      {interactiveHolding
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
            opacity: bubbleOpacity,
            transition: bubbleTransition,
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
                onClick={requestExit}
                disabled={confirmOpen}
                style={{ background: 'transparent', color: '#888', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', cursor: confirmOpen ? 'not-allowed' : 'pointer' }}
              >
                跳过
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                {idx > 0 ? (
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={navDisabled}
                    style={{ background: '#2a2a2e', color: '#ccc', border: '1px solid #555', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: navDisabled ? 'not-allowed' : 'pointer', opacity: navDisabled ? 0.55 : 1 }}
                  >
                    上一步
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={navDisabled}
                  style={{ background: '#fff', color: '#111', border: 'none', padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: navDisabled ? 'not-allowed' : 'pointer', opacity: navDisabled ? 0.55 : 1 }}
                >
                  {idx >= total - 1 ? '完成' : '下一步'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {/* R18X（§二）：左下角「退出新手指引」文字按钮（小号、灰描边；z 高于遮罩；交互步下也可点） */}
      <button
        type="button"
        onClick={requestExit}
        disabled={confirmOpen}
        style={{
          position: 'fixed',
          left: '16px',
          bottom: '16px',
          zIndex: 5,
          pointerEvents: 'auto',
          background: 'rgba(22,22,26,0.88)',
          color: '#aaa',
          border: '1px solid #666',
          borderRadius: '8px',
          padding: '6px 12px',
          fontSize: '12px',
          cursor: confirmOpen ? 'not-allowed' : 'pointer',
        }}
      >
        退出新手指引
      </button>
      {/* R18X（§二）：退出二次确认窗（引导层级内 z 最高；点遮罩=继续引导） */}
      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="退出新手指引确认"
          onClick={continueTour}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 6,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(320px, 86vw)',
              background: '#212126',
              border: '1px solid #3a3a40',
              borderRadius: '12px',
              padding: '20px 20px 16px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#f0f0f0', marginBottom: '18px' }}>是否退出新手指引？</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={continueTour}
                style={{ flex: 1, background: '#2a2a2e', color: '#ccc', border: '1px solid #555', padding: '9px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                继续引导
              </button>
              <button
                type="button"
                onClick={confirmExit}
                style={{ flex: 1, background: '#fff', color: '#111', border: 'none', padding: '9px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                确认退出
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
