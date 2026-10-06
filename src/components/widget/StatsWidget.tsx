/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  DEFAULT_VENDING_TITLE,
  DEFAULT_VENDING_URL,
  VendingConfig,
} from '@/src/lib/blog/vendingDefaults'
import { useMemberNavConfig } from '@/src/components/theme/SitePlanContext'
import {
  CrownIcon,
  MEMBER_NAV_JOIN_LABEL_COMPACT,
  MEMBER_NAV_LOGIN_LABEL,
  readMemberNoFromCookieString,
} from '@/src/components/member/MemberNav'
import { MemberLoginDialog } from '@/src/components/member/MemberLoginDialog'
// @ts-ignore
import { createPortal } from 'react-dom'

/**
 * R3-6:公告卡会员区按钮显示决策——guest → 双按钮(加入会员/登录);
 * 其余(probing/active/expired/disabled/未知) → 隐藏。
 * probing 归入 hidden 为无跳动设计(登录用户不闪现按钮;guest 探测后浮现,与 nav chip 同向)。
 */
export function resolveStatsWidgetMemberButtons(
  status: string | null | undefined
): 'dual' | 'hidden' {
  return status === 'guest' ? 'dual' : 'hidden'
}

// 🟢 你的自定义购买地址（请在这里修改为你真实的贩售机链接）
export const StatsWidget = ({
  data,
  vendingConfig,
  vendingEnabled = true,
}: {
  data: any
  vendingConfig?: VendingConfig | null
  vendingEnabled?: boolean
}) => {
  const[showModal, setShowModal] = useState(false)
  const [mounted, setMounted] = useState(false)
  const showVending = vendingConfig?.enabled ?? vendingEnabled
  const vendingUrl = vendingConfig?.url || DEFAULT_VENDING_URL
  const vendingTitle = vendingConfig?.title || DEFAULT_VENDING_TITLE
  // VENDING_MODE2:official（含列缺失/老数据）→「前往」+名称；custom → 用户名称原文
  const vendingLabel = vendingConfig?.mode === 'custom' ? vendingTitle : `前往${vendingTitle}`
  // VENDING_MODE2:购买说明弹窗开关；缺省 false=点击直接新标签跳转
  const noteModalEnabled = vendingConfig?.noteModal === true
  // R2-B5a:会员开通 → 贩售入口让位会员入口(未登录双按钮,见下);
  // 商品模式(未开通会员)行为零变化
  const memberMode = useMemberNavConfig() !== null
  // R3-6:公告卡会员区双按钮(仅未登录显示) + 登录弹窗
  const [memberSession, setMemberSession] = useState<string>('probing')
  const [loginOpen, setLoginOpen] = useState(false)

  // 会员站挂载单次探测会话(无轮询;SSG 安全;失败按未登录渲染)
  const probeMemberSession = useCallback(async (): Promise<string> => {
    let next: string = 'guest'
    try {
      const res = await fetch('/api/member/session', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      const status = data?.status
      if (status === 'active' || status === 'expired' || status === 'disabled') {
        next = status
      }
    } catch {
      // 探测失败按未登录渲染
    }
    setMemberSession(next)
    return next
  }, [])

  useEffect(() => {
    if (!memberMode) return
    // R4-B2:同步快判——无 member_no cookie → 立即 guest(双按钮即刻显示,零网络等待);
    // 有 → 维持 probing(会员不闪);随后探测仅作确认,结果覆盖
    if (!readMemberNoFromCookieString(document.cookie)) {
      setMemberSession('guest')
    }
    void probeMemberSession()
  }, [memberMode, probeMemberSession])

  // 1. 数据解析 (保持原样不动)
  const post = data || {};
  
  // 🚫 彻底移除图片逻辑，只使用纯色背景 (保持原样不动)
  const title = post.title || '网站说明和常见问题';
  const summary = post.summary || post.excerpt || '自助贩售机👇';
  const slug = post.slug ? `/post/${post.slug}` : null;

  useEffect(() => {
    setMounted(true)
  },[])

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [showModal])

  // --- 弹窗组件 (🟢 高级物理 3D 交互 + 购买说明) ---
  const Modal = () => {
    if (!mounted) return null
    // @ts-ignore
    return createPortal(
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <style jsx>{`
          @keyframes modalFade {
            0% { opacity: 0; backdrop-filter: blur(0px); }
            100% { opacity: 1; backdrop-filter: blur(8px); }
          }
          @keyframes cardPop {
            0% { opacity: 0; transform: scale(0.9) translateY(10px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          /* 动态扫光动画 */
          @keyframes shimmer {
            0% { transform: translateX(-150%) skewX(-20deg); }
            100% { transform: translateX(200%) skewX(-20deg); }
          }

          .animate-modal-bg { animation: modalFade 0.3s ease forwards; }
          .animate-card-pop { animation: cardPop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          
          /* 🟢 纯正的高级 3D 动态物理按钮 */
          .btn-3d-premium {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 16px 20px;
            font-size: 15px;
            font-weight: 900;
            letter-spacing: 2px;
            color: #ffffff;
            background: linear-gradient(145deg, #007aff, #0056b3);
            border-radius: 14px;
            /* 纯色硬阴影制造物理厚度感 + 底部漫反射光晕 */
            box-shadow: 0 6px 0 #003d7a, 0 15px 30px rgba(0, 122, 255, 0.2);
            /* 使用弹性贝塞尔曲线模拟真实的物理回弹 */
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            cursor: pointer;
            text-decoration: none;
            overflow: hidden;
          }

          /* 动态扫光伪元素 */
          .btn-3d-premium::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 40%;
            height: 100%;
            background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%);
            transform: translateX(-150%) skewX(-20deg);
            animation: shimmer 3s infinite cubic-bezier(0.4, 0, 0.2, 1);
          }

          /* 鼠标悬浮：稍微抬起，光晕增强（呼吸准备感） */
          .btn-3d-premium:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 0 #003d7a, 0 20px 40px rgba(0, 122, 255, 0.4);
            background: linear-gradient(145deg, #1a8bff, #0066cc);
          }

          /* 鼠标按下：瞬间干脆的物理按压感 */
          .btn-3d-premium:active {
            transform: translateY(6px); /* 向下陷 6px，吃掉硬阴影的高度 */
            box-shadow: 0 0 0 #003d7a, 0 5px 10px rgba(0, 122, 255, 0.2);
            transition: all 0.1s ease-out; /* 按下时速度加快，不拖泥带水 */
          }
        `}</style>

        {/* 遮罩：点击空白处关闭弹窗 */}
        <div 
          className="absolute inset-0 bg-black/70 animate-modal-bg cursor-pointer"
          onClick={() => setShowModal(false)}
        ></div>
        
        {/* 弹窗主体：纯粹、无多余元素的深色磨砂卡片 */}
        <div className="relative z-10 w-full max-w-[300px] rounded-3xl animate-card-pop bg-[#1a1a1c] shadow-2xl border border-white/5 p-6 flex flex-col items-center">
          
          {/* 购买说明模块 */}
          <div className="w-full mb-6 p-5 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
            <h3 className="text-sm font-bold text-white/90 mb-4 flex items-center gap-2">
              <span className="text-blue-500">🛒</span> 购买说明
            </h3>
            <div className="space-y-3">
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                <span className="text-blue-500 font-bold mr-1.5">1.</span>点击下方按钮跳转至官方自助贩售机。
              </p>
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                <span className="text-blue-500 font-bold mr-1.5">2.</span>输入编号查找您想购买的内容并按照指引步骤完成支付。
              </p>
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                <span className="text-blue-500 font-bold mr-1.5">3.</span>支付成功后自动发货，如有问题请联系右下角客服。
              </p>
            </div>
          </div>

          {/* 唯一的入口：高级 3D 动态光感按钮 */}
          <a
            href={vendingUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-blog-vending="1"
            className="btn-3d-premium"
            onClick={() => setShowModal(false)}
          >
            立即前往
          </a>

        </div>
      </div>,
      document.body
    )
  }

  // --- 动态渲染标签 (保持原样不动) ---
  // @ts-ignore
  const Wrapper = slug ? Link : 'div';

  // @ts-ignore
  const wrapperProps = slug 
    ? { href: slug, className: "flex flex-col group/text cursor-pointer relative z-20" } 
    : { className: "flex flex-col relative z-20 opacity-80" };

  return (
    <React.StrictMode>
      <style jsx global>{`
        @keyframes borderFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-border-flow { background-size: 200% 200%; animation: borderFlow 3s ease infinite; }
      `}</style>

      {showModal && showVending && !memberMode && <Modal />}

      <div className="relative h-full w-full group/card transition-transform duration-500 ease-out hover:scale-[1.015]">
        
        {/* 流光边缘 (保留原样不动) */}
        <div className="absolute -inset-[1px] rounded-[26px] bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-0 group-hover/card:opacity-70 blur-sm transition-opacity duration-500 animate-border-flow"></div>

        {/* 主体容器 (保留原样不动) */}
        <div className="relative h-full w-full overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-[#151516] flex flex-col">
          
          {/* ================= 背景图层 (保留原样不动) ================= */}
          <div className="absolute inset-0 z-0">
             <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-[40px]"></div>
             </div>
             <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>
          </div>

          {/* ================= 内容层 ================= */}
          <div className="relative z-10 flex flex-col h-full p-5 md:p-6">
            
            {/* 上半部分：公告内容（始终靠上） */}
            {/* @ts-ignore */}
            <Wrapper {...wrapperProps}>
               <div className="mb-2 flex items-center gap-1.5 opacity-90">
                 <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                 <span className="text-[10px] font-bold text-white/80 tracking-widest uppercase">公告</span>
               </div>

               <h2 className="text-xl md:text-2xl font-extrabold text-white leading-tight tracking-tight mb-2 group-hover/text:text-purple-300 transition-colors line-clamp-2">
                 {title}
               </h2>

               <p className="text-xs text-gray-300/90 font-medium line-clamp-2 leading-relaxed">
                 {summary}
               </p>
            </Wrapper>

            {/* 下半部分：R3-6 会员开通 → 未登录双按钮(红实心加入会员+白登录,仅 guest 显示)；
             已登录(active/expired)/disabled/probing → 隐藏(右上 chip 承担)；否则贩售机入口（有按钮时贴底） */}
            {memberMode ? (
              resolveStatsWidgetMemberButtons(memberSession) === 'dual' ? (
              <div className="w-full mt-auto pt-4 relative z-20 flex flex-col gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.assign('/pricing');
                  }}
                  type="button"
                  className="w-full h-8 rounded-xl flex items-center justify-center
                    bg-gradient-to-b from-[#e24a4a] to-[#c51f25]
                    text-xs font-bold text-white tracking-wide
                    transition-all duration-300
                    hover:from-[#d94040] hover:to-[#b81c22] hover:scale-[1.02] active:scale-95"
                >
                  {/* R10-B：文字严格居中 + 皇冠悬挂左侧（不占居中计算，与下方「登录」同中轴） */}
                  <span className="relative inline-flex items-center justify-center">
                    <CrownIcon className="absolute right-full top-1/2 -translate-y-1/2 mr-1.5 h-3 w-3 shrink-0 text-[#FACC15]" />
                    <span>{MEMBER_NAV_JOIN_LABEL_COMPACT}</span>
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLoginOpen(true);
                  }}
                  type="button"
                  className="w-full h-8 rounded-xl flex items-center justify-center
                    bg-gradient-to-b from-white to-[#f0f0f2]
                    text-xs font-bold text-neutral-900 tracking-wide
                    transition-all duration-300
                    hover:to-[#e7e7ea] hover:scale-[1.02] active:scale-95"
                >
                  <span>{MEMBER_NAV_LOGIN_LABEL}</span>
                </button>
              </div>
              ) : null
            ) : showVending ? (
            <div className="w-full mt-auto pt-4 relative z-20">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  noteModalEnabled ? setShowModal(true) : window.open(vendingUrl, '_blank', 'noopener,noreferrer');
                }}
                type="button"
                data-blog-vending="1"
                className="w-full h-9 rounded-xl flex items-center justify-center gap-2
                  bg-white/10 backdrop-blur-md border border-white/10
                  text-xs font-bold text-white tracking-wide
                  transition-all duration-300
                  hover:bg-white/20 hover:scale-[1.02] active:scale-95 active:bg-white/5"
              >
                <span className="text-sm">🚛</span>
                <span>{vendingLabel}</span>
              </button>
            </div>
            ) : null}

          </div>
        </div>
      </div>

      {/* R3-6:公告卡「登录」入口的全局登录弹窗(M-2:登录成功 → 重探自身;
          探得 active/expired → 整页刷新,消除「同页无 chip、全页无退出入口」死角) */}
      {memberMode ? (
        <MemberLoginDialog
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onSuccess={() => {
            void probeMemberSession().then((status) => {
              if (status === 'active' || status === 'expired') {
                window.location.reload()
              }
            })
          }}
          onDisabled={() => void probeMemberSession()}
        />
      ) : null}
    </React.StrictMode>
  )
}
