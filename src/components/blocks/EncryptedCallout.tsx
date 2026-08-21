import React, { useState, useEffect } from 'react'
import { Callout } from './BasicBlock'

const LockIcon = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="9.5" rx="2.5" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </svg>
)

const LockOpenIcon = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="9.5" rx="2.5" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 6.9-.9" />
  </svg>
)

export const EncryptedCallout = ({ block, children }: { block: any; children: any }) => {
  // 1. 获取内容与解析
  const richText = block.callout?.rich_text || [];
  const rawText = richText.map((t: any) => t.plain_text).join('') || '';
  
  // 正则匹配：以 LOCK: 开头
  const lockMatch = rawText.match(/^LOCK:\s*(.*)$/);
  const isLockedBlock = !!lockMatch;

  // hooks 必须位于提前 return 之前，保证 LOCK / 非 LOCK 分支 hooks 数量恒定
  const [input, setInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [error, setError] = useState(false);

  // 检查本地缓存
  useEffect(() => {
    if (localStorage.getItem(`unlocked-${block.id}`) === 'true') {
      setIsUnlocked(true);
    }
  }, [block.id]);

  // 如果没有 LOCK: 标记，直接渲染原本的 Callout 组件
  if (!isLockedBlock) {
    return <Callout block={block}>{children}</Callout>;
  }

  // 获取密码（去除首尾空格）
  const password = lockMatch[1].trim();
  // 判断模式：有密码则是"密码模式"，无密码则是"无密码模式"
  const hasPassword = password.length > 0;

  const handleUnlock = () => {
    // 只有有密码时才校验，无密码直接过
    if (hasPassword && input !== password) {
      setError(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(200);
      return;
    }

    setIsUnlocked(true);
    setError(false);
    localStorage.setItem(`unlocked-${block.id}`, 'true');
  };

  // --- 状态 A: 已解锁（精致内容容器：细实线边框 + 内微光 + 柔和投影 + 顶部渐变细线） ---
  if (isUnlocked) {
    // 后台保存协议会在加密 callout 的 children 首块插入一个 divider（编辑器导入时被剥离），
    // 前台隐藏该首块，避免「已解锁」下方出现灰色横线
    const firstChildIsDivider = block.children?.[0]?.type === 'divider';
    return (
      <div className="gallery-encrypted-unlocked relative my-6 animate-fade-in overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.14)] dark:border-neutral-700/60 dark:bg-[#1b1b1f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_-16px_rgba(0,0,0,0.6)]">
        {/* 顶部渐变细线：自主色渐隐到透明 */}
        <div className="gallery-encrypted-unlocked__line absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-500/70 via-blue-400/25 to-transparent dark:from-blue-400/60 dark:via-blue-400/20" />
        <div className="relative px-4 pt-3 sm:px-6">
          <span className="gallery-encrypted-unlocked__badge flex items-center gap-1.5 font-gallery text-[11px] font-medium tracking-wide text-neutral-400 dark:text-neutral-500">
            <LockOpenIcon className="h-3.5 w-3.5" />
            已解锁
          </span>
        </div>
        {/* 内容区：不切割 children，保证内容绝对显示 */}
        <div
          className={`gallery-encrypted-unlocked__content relative px-4 pb-5 pt-3 sm:px-6 sm:pb-6${
            firstChildIsDivider ? ' [&>*:first-child]:hidden' : ''
          }`}
        >
          {children}
        </div>
      </div>
    );
  }

  // --- 状态 B: 未解锁（统一风格的密码面板） ---
  return (
    <div className="gallery-encrypted-panel relative my-8 overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.14)] dark:border-neutral-800 dark:bg-[#181818] dark:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.6)]">

      {/* 静态柔和底光 */}
      <div className="gallery-encrypted-panel__bg absolute inset-0 bg-neutral-50 dark:bg-[#121212]"></div>
      <div className="pointer-events-none absolute -top-16 right-[-10%] h-52 w-52 rounded-full bg-blue-500/[0.07] blur-[70px] dark:bg-blue-500/10"></div>
      <div className="pointer-events-none absolute -bottom-16 left-[-10%] h-52 w-52 rounded-full bg-purple-500/[0.06] blur-[70px] dark:bg-purple-500/10"></div>

      <div className="relative z-10 flex select-none flex-col items-center justify-center px-6 py-9 text-center sm:px-8 sm:py-10">

        <div className="gallery-encrypted-panel__title mb-2 flex items-center gap-2">
          <LockIcon className="gallery-encrypted-panel__lock-icon h-[18px] w-[18px] text-neutral-400 dark:text-neutral-500" />
          <h3 className="font-gallery text-lg font-semibold text-neutral-900 dark:text-white sm:text-xl">
            {hasPassword ? '受保护的内容' : '敏感内容'}
          </h3>
        </div>

        <p className="gallery-encrypted-panel__desc font-gallery mb-6 max-w-xs text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {hasPassword
            ? '该区域包含加密内容，请输入密码解锁。'
            : '该区域可能包含敏感内容。'}
        </p>

        <div className="flex w-full max-w-sm flex-col items-stretch justify-center gap-3 sm:flex-row">

          {/* 只有在有密码时，才显示输入框 */}
          {hasPassword && (
            <input
              type="password"
              placeholder="请输入密码..."
              className={`
                gallery-encrypted-panel__input font-gallery flex-1 rounded-xl border bg-white px-4 py-2.5 text-sm text-neutral-900 shadow-sm outline-none transition-all placeholder:text-neutral-400
                dark:bg-neutral-900/70 dark:text-white
                ${error
                  ? 'border-red-400/80 ring-4 ring-red-500/10 dark:border-red-500/70'
                  : 'border-neutral-200 hover:border-neutral-300 focus:border-neutral-400 focus:ring-4 focus:ring-neutral-900/[0.06] dark:border-neutral-700/80 dark:hover:border-neutral-600 dark:focus:border-neutral-500 dark:focus:ring-blue-500/10'
                }
              `}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if(error) setError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            />
          )}

          {/* 解锁按钮 */}
          <button
            onClick={handleUnlock}
            className={`
              gallery-encrypted-panel__unlock font-gallery whitespace-nowrap rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all
              hover:bg-neutral-700 active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-500
              ${!hasPassword ? 'w-full sm:w-auto' : ''}
            `}
          >
            {hasPassword ? '解锁' : '显示内容'}
          </button>
        </div>

        {/* 错误提示 */}
        {hasPassword && (
          <div className={`
            gallery-encrypted-panel__error font-gallery mt-3.5 text-sm font-medium text-red-500 transition-all duration-300
            ${error ? 'translate-y-0 opacity-100' : 'pointer-events-none h-0 -translate-y-2 opacity-0'}
          `}>
            <span>密码错误</span>
          </div>
        )}
      </div>
    </div>
  );
};
