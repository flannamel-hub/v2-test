'use client';
import React, { useEffect, useState } from 'react';

/**
 * R18X（§四）：新手引导欢迎弹窗。
 * 页内单层深灰弹窗，复用 AdminDashboard GlobalStyle 注入的 cover-modal-* 样式
 * （open/closing 双态 + 240ms 退场定时器由父层持有，与 EditorTourDoneModal 等一致）。
 * props:
 *   - open / closing：双态开关
 *   - onStart：「开始指引」——父层实现 = 关闭弹窗 + 走既有首页引导自动弹逻辑
 *     （就绪门控 → 开启首页引导；链式接编辑器照旧）
 *   - onDecline：「不需要」——父层实现 = 关闭弹窗 + best-effort 双写 home/editor
 *     标记（1A 语义=以后都不再自动打扰）；不启动任何引导
 * 遮罩点击不触发任何动作（避免误触写标记/误启动），必须明确选择按钮。
 * 仅在无引导打开时由父层弹出（单飞）。
 */
const WelcomeTourModal = ({ open, closing, onStart, onDecline }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open && !closing) {
      setVisible(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    if (!open || closing) setVisible(false);
  }, [open, closing]);

  if (!open && !closing) return null;

  return (
    <div
      className={`cover-modal-backdrop ${visible && !closing ? 'is-visible' : ''} ${closing ? 'is-closing' : ''}`}
      role="presentation"
    >
      <div
        className="cover-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-modal-title"
      >
        <div className="cover-modal-icon" aria-hidden>👋</div>
        <h3 id="welcome-tour-modal-title" className="cover-modal-title">欢迎使用 BLOG 后台</h3>
        <div className="cover-modal-desc">这里是你的内容发布中心。需要一份新手引导带你快速上手吗？</div>
        <div className="cover-modal-actions">
          <button type="button" className="cover-modal-btn cover-modal-btn-secondary" onClick={onDecline}>
            不需要
          </button>
          <button type="button" className="cover-modal-btn cover-modal-btn-primary" onClick={onStart} style={{ flex: 1 }}>
            开始指引
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeTourModal;
