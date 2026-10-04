'use client'

import Link from 'next/link'
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
 */

export const LOGIN_ERROR_TEXT: Record<string, string> = {
  invalid: '访问串无效',
  revoked: '该访问串已停用',
  rate_limited: '尝试过于频繁，请稍后再试',
  unavailable: '暂时不可用，请稍后重试',
}

/** QR 类错误文案(bad_file 独立于 decode_failed,§10.2-Q5) */
export const QR_BAD_FILE_TEXT = '文件过大或格式不支持'
export const QR_DECODE_FAILED_TEXT = '未识别到二维码，请重试或直接粘贴访问串'
const QR_DECODING_TEXT = '识别中…'
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

function formatExpiryDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

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
      ? 'border-neutral-700 bg-[#181818]/95'
      : panelTheme === 'light'
        ? 'border-neutral-200/80 bg-white/95'
        : 'border-neutral-200/80 bg-white/95 dark:border-neutral-700 dark:bg-[#181818]/95'
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
  const secondaryButtonCls =
    panelTheme === 'dark'
      ? 'border-neutral-700 hover:bg-neutral-800'
      : panelTheme === 'light'
        ? 'border-neutral-200 hover:bg-neutral-100'
        : 'border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-login-title"
      onClick={() => {
        if (!loginSubmitting) onClose()
      }}
    >
      <div
        className={`w-full max-w-[320px] rounded-xl border shadow-xl ${panelCls}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3 px-4 py-5 select-none sm:px-5">
          <p
            id="member-login-title"
            className={`text-center text-sm font-medium ${titleCls}`}
          >
            会员登录
          </p>

          {probe.phase === 'probing' ? (
            <p className={`text-center text-xs ${mutedCls}`}>…</p>
          ) : probe.phase === 'loggedIn' ? (
            <div className="flex flex-col gap-3">
              <p className={`text-center text-sm ${titleCls}`}>
                {probe.status === 'active' ? '已登录' : '会员已到期'}
              </p>
              {formatExpiryDate(probe.expiresAt) ? (
                <p className={`text-center text-xs ${mutedCls}`}>
                  {probe.status === 'active' ? '会员有效期至 ' : '到期日 '}
                  {formatExpiryDate(probe.expiresAt)}
                </p>
              ) : null}
              <Link
                href="/member"
                onClick={() => onClose()}
                className={`w-full rounded-lg px-4 py-2 text-center text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
              >
                进入会员中心
              </Link>
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
              <input
                type="password"
                placeholder="访问串"
                className={`w-full rounded-lg border-2 px-3 py-2 text-sm outline-none transition-all ${inputSurfaceCls} ${
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
                onClick={() => fileInputRef.current?.click()}
                disabled={qrDecoding || loginSubmitting}
                className={`w-full rounded-lg border px-4 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${secondaryButtonCls} ${mutedCls}`}
              >
                {qrDecoding ? '识别中…' : '上传二维码图片'}
              </button>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => void submitLogin()}
                  disabled={loginSubmitting || !accessKeyInput.trim()}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${primaryButtonCls}`}
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
