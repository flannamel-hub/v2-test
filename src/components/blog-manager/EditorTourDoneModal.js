'use client';
import React, { useEffect, useState } from 'react';

/**
 * R18（§八-4）：编辑器聚焦引导完成后的恭喜弹窗。
 * 页内单层深灰弹窗，复用 AdminDashboard GlobalStyle 注入的 cover-modal-* 样式
 * （open/closing 双态 + 240ms 退场定时器由父层持有，与 MissingFieldsModal 等一致）。
 * props:
 *   - open / closing：双态开关
 *   - onBackHome：「回到首页」/遮罩点击——父层实现 = 关闭弹窗 + 调用与顶部
 *     「返回列表」按钮完全相同的处理函数（guardLeaveEditor 语义原样：dirty 时照旧三选一）
 * 仅 reason='done'（末步「下一步」）时由父层打开；跳过/Esc 不弹。
 * R18X（§三）：「回到首页」在执行 onBackHome 后追加滚动归零——window.scrollTo(0,0) +
 * #admin-container 的 scrollTop=0（try/catch，延后 ~100ms 执行待视图切换）。
 */
const EditorTourDoneModal = ({ open, closing, onBackHome }) => {
  const [visible, setVisible] = useState(false);

  // R18X（§三）：回到首页后页面自动定位到顶部（延后 ~100ms 待视图切换）
  const handleBackHome = () => {
    if (onBackHome) onBackHome();
    try {
      window.setTimeout(() => {
        try {
          window.scrollTo(0, 0);
          const container = document.getElementById('admin-container');
          if (container) container.scrollTop = 0;
        } catch (_) {
          /* 滚动归零失败静默 */
        }
      }, 100);
    } catch (_) {
      /* ignore */
    }
  };

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
      onClick={handleBackHome}
      role="presentation"
    >
      <div
        className="cover-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-tour-done-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cover-modal-icon" aria-hidden>🎉</div>
        <h3 id="editor-tour-done-modal-title" className="cover-modal-title">恭喜你已经掌握BLOG内容发布的基本技巧</h3>
        <div className="cover-modal-actions">
          <button type="button" className="cover-modal-btn cover-modal-btn-primary" onClick={handleBackHome} style={{ flex: 1 }}>
            回到首页
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorTourDoneModal;
