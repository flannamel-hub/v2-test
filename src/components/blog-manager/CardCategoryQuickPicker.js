import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** 与后台一致的不可选择系统分类（「未分类」可选，不在此列） */
const PROTECTED_CATEGORIES = new Set(['网站信息', '系统组件', '站长通知']);

/** 兜底分类（与 AdminDashboard FALLBACK_CATEGORY 一致，可选） */
const FALLBACK_CATEGORY = '未分类';

/**
 * 文章卡片分类 chip 的快速改分类下拉。
 * 通过 portal 渲染到 body，避免被卡片 overflow / hover transform 裁剪或错位。
 */
const CardCategoryQuickPicker = ({ anchorRect, currentCategory, categories, onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted) inputRef.current?.focus();
  }, [mounted]);

  useEffect(() => {
    const onDocDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [onClose]);

  const baseCategories = useMemo(() => {
    const list = [...(categories || [])].filter(
      (c) => c && !PROTECTED_CATEGORIES.has(String(c).trim())
    );
    if (!list.includes(FALLBACK_CATEGORY)) list.unshift(FALLBACK_CATEGORY);
    return list.sort((a, b) => {
      if (a === FALLBACK_CATEGORY) return -1;
      if (b === FALLBACK_CATEGORY) return 1;
      return a.localeCompare(b, 'zh-CN');
    });
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseCategories;
    return baseCategories.filter((c) => c.toLowerCase().includes(q));
  }, [baseCategories, query]);

  if (!mounted || !anchorRect) return null;

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const width = Math.min(Math.max(anchorRect.width || 180, 180), viewportW - 16);
  const left = Math.max(8, Math.min(anchorRect.left || 0, viewportW - width - 8));
  const top = Math.max(8, anchorRect.top || 0);
  const maxHeight = Math.max(180, Math.min(300, viewportH - top - 12));
  const current = (currentCategory || '').trim();

  const renderRow = (cat, value, opts = {}) => {
    const active = current !== '' && current === cat && !opts.isNoCategory;
    const noCategoryActive = opts.isNoCategory && current === '';
    return (
      <button
        key={opts.isNoCategory ? '__no_category__' : cat}
        type="button"
        className={`card-cat-qp-row${active || noCategoryActive ? ' is-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(value)}
        title={opts.title}
      >
        {cat}
        {active || noCategoryActive ? (
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'greenyellow' }}>✓</span>
        ) : null}
      </button>
    );
  };

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 1200,
        background: '#2a2a2e',
        border: '1px solid #555',
        borderRadius: '10px',
        boxShadow: '0 12px 28px rgba(0,0,0,0.55)',
        maxHeight,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div style={{ padding: '8px', borderBottom: '1px solid #3a3a3f', flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索分类…"
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: '12px',
            background: '#18181c',
            border: '1px solid #333',
            borderRadius: '6px',
            color: '#fff',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div
        style={{
          overflowY: 'auto',
          minHeight: '60px',
          flex: '0 1 auto',
        }}
      >
        {filteredCategories.length > 0 ? (
          filteredCategories.map((cat) => renderRow(cat, cat))
        ) : (
          <div style={{ padding: '12px 14px', fontSize: '12px', color: '#888', textAlign: 'center' }}>
            无匹配分类
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid #3a3a3f', flexShrink: 0 }}>
        {renderRow('无分类', '', { isNoCategory: true, title: '清空文章分类' })}
      </div>
    </div>,
    document.body
  );
};

export default CardCategoryQuickPicker;
