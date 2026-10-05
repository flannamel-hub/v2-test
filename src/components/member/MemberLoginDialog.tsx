'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useActiveTheme } from '@/src/components/theme/ActiveThemeProvider'
import { normalizeMemberAccessKey } from '@/src/lib/blog/memberAccessKey'
import { decodeMemberQrFromFile } from '@/src/lib/blog/memberQr'
import { isTweetDarkTheme, isTweetLightTheme } from '@/src/themes/tweet/tweetTheme'

/**
 * 站点会员 B4-W1:全局可复用登录弹窗(正式版)。
 * - 与 MemberContentGate 旧内联弹窗视觉/交互同源:页内弹窗(禁原生),createPortal 挂 body
 *   (祖先可能带 transform/backdrop-blur);panelTheme 三态照抄 ArticlePasswordGate;
 * - 打开时探测一次 session(Q6:不做 initialSession 优化,组件自洽,代价一次 GET;
 *   任何位置不加 interval/轮询):已登录(active/expired)显示轻态,未登录显示表单;
 * - 表单提交前客户端 normalizeMemberAccessKey 规范化(服务端既有规范化不动);
 * - QR 上传解码(memberQr):成功自动填充输入框(不自动提交);
 * - 行为等价回归点:登录成功→关窗+清输入+onSuccess;error=disabled→关窗+onDisabled
 *   (page props 的 membershipConfig 是 ISR 旧值,不作消失依据,由调用方重跑 session);
 *   提交中禁取消/禁遮罩关;Enter 提交;空值禁用。
 * - R3-5 重做:遮罩/面板全不透明(#0c0c0e / #181818|white)、400px 大窗、标题「登录」、
 *   会员码输入眼睛开关(Q5:Tab 可达、aria-label 随态)、QR 拖拽区(虚线框+拖入高亮,
 *   Q9:busy 态忽略交互、dragover/drop 均 preventDefault)、表单「登录」提交钮品牌红
 *   (Q4:「继续浏览」维持中性色)。
 */

export const LOGIN_ERROR_TEXT: Record<string, string> = {
  invalid: '会员码无效',
  revoked: '该会员码已停用',
  rate_limited: '尝试过于频繁，请稍后再试',
  unavailable: '暂时不可用，请稍后重试',
}

/** QR 类错误文案(bad_file 独立于 decode_failed,§10.2-Q5) */
export const QR_BAD_FILE_TEXT = '文件过大或格式不支持'
export const QR_DECODE_FAILED_TEXT = '未识别到二维码，请重试或直接粘贴会员码'
const QR_DECODING_TEXT = '识别中…'
const QR_DROPZONE_TEXT = '拖拽二维码图片到此处，或点击选择'
const INPUT_HINT_TEXT = '可直接粘贴，空格与连字符会被忽略'

type SessionProbe =
  | { phase: 'probing' }
  | { phase: 'form' }
  | { phase: 'loggedIn'; status: 'active' | 'expired'; expiresAt: string | null }

type MemberLoginDialogProps = {
  open: boolean
  onClose: () => void
  /** 登录成功(active/expired 均发 cookie)后回调;调用方自行重跑 session */
  onSuccess?: () => void
  /** 登录返回 disabled(门控已关)后回调;调用方重跑 session 让面板按新状态消失 */
  onDisabled?: () => void
  /** 主题 id(panelTheme 三态判定;缺省回落 useActiveTheme) */
  theme?: string
  /** 打开时注入的一次性错误行(gate「登录状态异常」等场景) */
  initialError?: string
}

/** 到期日展示(ISO → YYYY/MM/DD;无效/缺失 → '')。
 * R2-B5a Q13:导出复用(MemberNav chip 浮窗),勿另复制一份。 */
export function formatExpiryDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

/** R3-3:永久档展示阈值(天)——expires_at 距今超过该天数按「永久有效」展示。
 * 只影响展示文案,不动到期/续费/权限判定逻辑。 */
export const MEMBER_PERMANENT_DAYS_THRESHOLD = 30000

/** R3-3:永久档展示判定(严格大于,恰等阈值不算);无效/缺失 → false */
export function isPermanentMemberExpiry(
  expiresAtIso: string | null | undefined,
  nowMs?: number
): boolean {
  if (!expiresAtIso) return false
  const time = new Date(expiresAtIso).getTime()
  if (Number.isNaN(time)) return false
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  return time - now > MEMBER_PERMANENT_DAYS_THRESHOLD * 86400_000
}

/** R3-3:会员有效期展示文案——永久 →「永久有效」;限时 → prefix + 日期;
 * 无效/缺失 → ''(消费方自行兜底,如 chip 的「会员生效中」/条件渲染)。 */
export function formatMemberValidityText(
  expiresAtIso: string | null | undefined,
  prefix = '会员有效期至'
): string {
  if (!expiresAtIso) return ''
  if (isPermanentMemberExpiry(expiresAtIso)) return '永久有效'
  const date = formatExpiryDate(expiresAtIso)
  if (!date) return ''
  return `${prefix} ${date}`
}

/** R3-3:档位标签展示映射(与系统侧 formatMembershipTierLabel 等价的 BLOG 本地映射)——
 * days ≥ 36500 →「永久」,否则「N 天」。仅展示,不改 plans 数据。 */
export const MEMBER_PERMANENT_PLAN_DAYS = 36500

export function formatMembershipTierLabel(days: number): string {
  return days >= MEMBER_PERMANENT_PLAN_DAYS ? '永久' : `${days} 天`
}

/** R3-5:会员码可见性切换(线性眼睛/斜线眼睛,~16px) */
const EyeIcon = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a19.8 19.8 0 0 1 5.06-5.94M9.9 4.24A9.9 9.9 0 0 1 12 4c6.5 0 10 7 10 7a19.8 19.8 0 0 1-3.22 4.31" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export function MemberLoginDialog({
  open,
  onClose,
  onSuccess,
  onDisabled,
  theme,
  initialError,
}: MemberLoginDialogProps) {
  const activeTheme = useActiveTheme()
  const resolvedTheme = theme || activeTheme
  const [probe, setProbe] = useState<SessionProbe>({ phase: 'probing' })
  const [accessKeyInput, setAccessKeyInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [qrHint, setQrHint] = useState('')
  const [qrDecoding, setQrDecoding] = useState(false)
  const [qrDragActive, setQrDragActive] = useState(false)
  const [showAccessKey, setShowAccessKey] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [mounted, setMounted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const probeSession = useCallback(async () => {
    setProbe({ phase: 'probing' })
    try {
      const res = await fetch('/api/member/session', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      const status = data?.status
      if (status === 'active' || status === 'expired') {
        const expiresAt =
          typeof data?.expires_at === 'string' ? data.expires_at : null
        setProbe({ phase: 'loggedIn', status, expiresAt })
        return
      }
      setProbe({ phase: 'form' })
    } catch {
      // 探测失败按表单呈现(登录提交会再走服务端校验)
      setProbe({ phase: 'form' })
    }
  }, [])

  // 打开时:探测一次 session + 注入一次性错误行
  useEffect(() => {
    if (!open) return
    setLoginError(typeof initialError === 'string' && initialError ? initialError : '')
    setQrHint('')
    setQrDecoding(false)
    void probeSession()
  }, [open, initialError, probeSession])

  const submitLogin = useCallback(async () => {
    const accessKey = normalizeMemberAccessKey(accessKeyInput)
    if (!accessKey || loginSubmitting) return
    setLoginSubmitting(true)
    setLoginError('')
    try {
      const res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key: accessKey }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        // 关窗+清输入;session 重跑交调用方(active → 渲染内容;
        // expired → 到期面板;B1 login 对到期会员亦发 cookie)
        setAccessKeyInput('')
        onClose()
        onSuccess?.()
        return
      }
      const err = data?.error
      if (err === 'disabled') {
        // 关窗并交调用方重跑 session(session 返回 disabled → 面板消失;
        // page props 的 membershipConfig 是 ISR 旧值,不可作为消失依据)
        onClose()
        onDisabled?.()
        return
      }
      setLoginError(LOGIN_ERROR_TEXT[err] ?? LOGIN_ERROR_TEXT.unavailable)
    } catch {
      setLoginError(LOGIN_ERROR_TEXT.unavailable)
    } finally {
      setLoginSubmitting(false)
    }
  }, [accessKeyInput, loginSubmitting, onClose, onSuccess, onDisabled])

  const handleQrFile = useCallback(async (file: File | null | undefined) => {
    if (!file || qrDecoding) return
    setQrDecoding(true)
    setQrHint(QR_DECODING_TEXT)
    try {
      const result = await decodeMemberQrFromFile(file)
      if (result.ok) {
        // 解码文本规范化后自动填充输入框(不自动提交)
        setAccessKeyInput(normalizeMemberAccessKey(result.text))
        setQrHint('')
        setLoginError('')
      } else if (result.error === 'bad_file') {
        setQrHint(QR_BAD_FILE_TEXT)
      } else {
        setQrHint(QR_DECODE_FAILED_TEXT)
      }
    } catch {
      setQrHint(QR_DECODE_FAILED_TEXT)
    } finally {
      setQrDecoding(false)
    }
  }, [qrDecoding])

  const handleLogout = useCallback(async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await fetch('/api/member/logout', { method: 'POST', cache: 'no-store' })
    } catch {
      // 清 cookie 为服务端行为;失败也回落表单重探
    }
    setLoggingOut(false)
    await probeSession()
  }, [loggingOut, probeSession])

  // ---- 面板主题三态(照抄 ArticlePasswordGate 的 panelTheme 逻辑) ----
  const panelTheme =
    isTweetLightTheme(resolvedTheme) || resolvedTheme === 'gallery'
      ? 'light'
      : isTweetDarkTheme(resolvedTheme)
        ? 'dark'
        : 'auto'
  const panelCls =
    panelTheme === 'dark'
      ? 'border-neutral-700 bg-[#181818]'
      : panelTheme === 'light'
        ? 'border-neutral-200/80 bg-white'
        : 'border-neutral-200/80 bg-white dark:border-neutral-700 dark:bg-[#181818]'
  const titleCls =
    panelTheme === 'dark'
      ? 'text-neutral-200'
      : panelTheme === 'light'
        ? 'text-neutral-700'
        : 'text-neutral-700 dark:text-neutral-200'
  const mutedCls =
    panelTheme === 'dark'
      ? 'text-neutral-400'
      : panelTheme === 'light'
        ? 'text-neutral-500'
        : 'text-neutral-500 dark:text-neutral-400'
  const inputSurfaceCls =
    panelTheme === 'dark'
      ? 'bg-neutral-900 text-white'
      : panelTheme === 'light'
        ? 'bg-white text-neutral-900'
        : 'bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white'
  const inputIdleCls =
    panelTheme === 'dark'
      ? 'border-transparent hover:bg-neutral-800 focus:border-blue-500'
      : panelTheme === 'light'
        ? 'border-neutral-200 hover:border-neutral-300 focus:border-neutral-900'
        : 'border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 dark:border-transparent dark:hover:bg-neutral-800 dark:focus:border-blue-500'
  const primaryButtonCls =
    panelTheme === 'dark'
      ? 'bg-blue-600 hover:bg-blue-500'
      : panelTheme === 'light'
        ? 'bg-neutral-900 hover:bg-neutral-700'
        : 'bg-neutral-900 hover:bg-neutral-700 dark:bg-blue-600 dark:hover:bg-blue-500'
  // R3-5/Q4:品牌红仅用于表单「登录」提交钮(全主题同款);「继续浏览」维持中性色
  const loginSubmitButtonCls = 'bg-[#dc2626] hover:bg-[#b91c1c]'
  // R3-5:拖拽区静置描边(三态主题);拖入高亮用品牌红系(禁亮绿)
  const dropzoneIdleCls =
    panelTheme === 'dark'
      ? 'border-neutral-600'
      : panelTheme === 'light'
        ? 'border-neutral-300'
        : 'border-neutral-300 dark:border-neutral-600'
  const secondaryButtonCls =
    panelTheme === 'dark'
      ? 'border-neutral-700 hover:bg-neutral-800'
      : panelTheme === 'light'
        ? 'border-neutral-200 hover:bg-neutral-100'
        : 'border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'

  // R3-3:登录态有效期行(永久 →「永久有效」;限时 → 前缀+日期;缺失/无效 → 不渲染)
  const loggedInValidityText =
    probe.phase === 'loggedIn'
      ? formatMemberValidityText(
          probe.expiresAt,
          probe.status === 'active' ? '会员有效期至' : '到期日'
        )
      : ''

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#0c0c0e] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-login-title"
      onClick={() => {
        if (!loginSubmitting) onClose()
      }}
    >
      <div
        className={`w-full max-w-[400px] rounded-xl border shadow-xl ${panelCls}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-4 px-6 py-7 select-none sm:px-7">
          <p
            id="member-login-title"
            className={`text-center text-lg font-semibold ${titleCls}`}
          >
            登录
          </p>

          {probe.phase === 'probing' ? (
            <p className={`text-center text-xs ${mutedCls}`}>…</p>
          ) : probe.phase === 'loggedIn' ? (
            <div className="flex flex-col gap-3">
              <p className={`text-center text-sm ${titleCls}`}>
                {probe.status === 'active' ? '已登录' : '会员已到期'}
              </p>
              {loggedInValidityText ? (
                <p className={`text-center text-xs ${mutedCls}`}>
                  {loggedInValidityText}
                </p>
              ) : null}
              {/* R2-B5a(/member 已退役):主按钮「继续浏览」= 关闭;次按钮「退出登录」 */}
              <button
                type="button"
                onClick={() => onClose()}
                className={`w-full rounded-lg px-4 py-2 text-center text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
              >
                继续浏览
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className={`w-full rounded-lg border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${secondaryButtonCls} ${mutedCls}`}
              >
                {loggingOut ? '退出中…' : '退出登录'}
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <input
                  type={showAccessKey ? 'text' : 'password'}
                  placeholder="会员码"
                  className={`w-full rounded-lg border-2 px-3 py-2 pr-9 text-sm outline-none transition-all ${inputSurfaceCls} ${
                    loginError ? 'border-red-500 focus:border-red-500' : inputIdleCls
                  }`}
                  value={accessKeyInput}
                  onChange={(e) => {
                    setAccessKeyInput(e.target.value)
                    if (loginError) setLoginError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && accessKeyInput.trim() && !loginSubmitting) {
                      void submitLogin()
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  aria-label={showAccessKey ? '隐藏会员码' : '显示会员码'}
                  onClick={() => setShowAccessKey((v) => !v)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors hover:opacity-80 ${mutedCls}`}
                >
                  {showAccessKey ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              {loginError ? (
                <p className="text-center text-xs font-medium text-red-500">
                  {loginError}
                </p>
              ) : null}
              {qrHint ? (
                <p className={`text-center text-xs ${mutedCls}`}>{qrHint}</p>
              ) : (
                <p className={`text-center text-[11px] ${mutedCls}`}>{INPUT_HINT_TEXT}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void handleQrFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                aria-disabled={qrDecoding || loginSubmitting}
                onClick={() => {
                  if (!qrDecoding && !loginSubmitting) {
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!qrDecoding && !loginSubmitting) setQrDragActive(true)
                }}
                onDragEnter={(e) => {
                  e.preventDefault()
                  if (!qrDecoding && !loginSubmitting) setQrDragActive(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setQrDragActive(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setQrDragActive(false)
                  if (!qrDecoding && !loginSubmitting) {
                    void handleQrFile(e.dataTransfer?.files?.[0])
                  }
                }}
                className={`w-full rounded-lg border-2 border-dashed px-4 py-3.5 text-center text-xs transition-colors ${mutedCls} ${
                  qrDragActive
                    ? 'border-red-500/80 bg-red-500/10'
                    : dropzoneIdleCls
                } ${qrDecoding || loginSubmitting ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
              >
                {QR_DROPZONE_TEXT}
              </button>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => void submitLogin()}
                  disabled={loginSubmitting || !accessKeyInput.trim()}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${loginSubmitButtonCls}`}
                >
                  {loginSubmitting ? '登录中…' : '登录'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!loginSubmitting) onClose()
                  }}
                  disabled={loginSubmitting}
                  className={`w-full rounded-lg px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mutedCls} hover:opacity-80`}
                >
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
