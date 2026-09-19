'use client';
import React, { useEffect, useState } from 'react';

/**
 * R17-D3（§七-11）：发布校验缺项弹窗。
 * 页内单层深灰弹窗，复用 AdminDashboard GlobalStyle 注入的 cover-modal-* 样式
 * （open/closing 双态 + 240ms 退场模式，与 CoverMissingModal 等一致）。
 * props:
 *   - open / closing：双态开关（父层持有，退场定时器在父层）
 *   - items：[{ label: string, step: number|null }] 缺失项列表
 *   - onJump(step)：点击「去填写」；父层展开对应步骤并滚动到 [data-editor-step]
 *   - onClose：关闭（「知道了」/遮罩）
 * 无 step（如组件编辑器场景）的项不渲染「去填写」。
 */
const MissingFieldsModal = ({ open, closing, items, onJump, onClose }) => {
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
      onClick={onClose}
      role="presentation"
    >
      <div
        className="cover-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="missing-fields-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="missing-fields-modal-title" className="cover-modal-title">还有必填项未完成</h3>
        <p className="cover-modal-desc" style={{ marginBottom: 16 }}>
          以下内容为必填项，完成后即可发布。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: 20 }}>
          {(Array.isArray(items) ? items : []).map((item, idx) => (
            <div
              key={`${item?.label || 'field'}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '11px 12px',
                borderRadius: '10px',
                background: '#2a2a2e',
                border: '1px solid #3a3a42',
              }}
            >
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#e5e5e5', lineHeight: 1.5 }}>
                {item?.label}
                <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>
              </span>
              {item && item.step != null ? (
                <button
                  type="button"
                  onClick={() => onJump?.(item.step)}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(173,255,47,0.45)',
                    background: 'rgba(173,255,47,0.12)',
                    color: 'greenyellow',
                    fontSize: '12.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(173,255,47,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(173,255,47,0.12)'; }}
                >
                  去填写
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="cover-modal-actions">
          <button type="button" className="cover-modal-btn cover-modal-btn-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};

export default MissingFieldsModal;
