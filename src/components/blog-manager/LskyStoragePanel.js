'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addLskyTrashItems,
  clearLskyTrashHistory,
  getLskyTrashRemainingMs,
  isLskyTrashExpired,
  listLskyTrash,
  listLskyTrashHistory,
  pushLskyTrashHistory,
  removeLskyTrashKeys,
} from '@/src/lib/admin/lskyTrashStore';
import { GalleryStorageBar } from './GalleryStorageBar';

/**
 * Phase6 图床治理 —— 后台存储管理面板（view='lsky'）
 * 扫描（只读）→ 孤立列表勾选 → 移入回收站（本地清单，7 天缓冲）
 * → 到期惰性清理 / 手动立即清理（真删并留痕 ≤50 条）。
 * 文案铁律：不出现技术栈关键字，统一称「存储服务 / 云端」。
 */

function formatSizeKB(kb) {
  const n = Math.max(0, Number(kb) || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} MB`;
  return `${Math.round(n)} KB`;
}

function formatRemainingLabel(remainingMs) {
  if (remainingMs <= 0) return '待清理';
  const days = Math.ceil(remainingMs / 86400000);
  return `${days} 天后自动清理`;
}

function formatTimestamp(ms) {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    const pad = (v) => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (_) {
    return '';
  }
}

function OrphanThumb({ url, name }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div
        title={name}
        style={{
          width: 46,
          height: 46,
          borderRadius: 8,
          background: '#1a1a1e',
          border: '1px solid #444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ▦
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name || ''}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        width: 46,
        height: 46,
        borderRadius: 8,
        objectFit: 'cover',
        background: '#1a1a1e',
        border: '1px solid #444',
        flexShrink: 0,
      }}
    />
  );
}

const sectionTitleStyle = {
  fontSize: '13px',
  color: '#9acd32',
  marginBottom: '14px',
  fontWeight: 'bold',
};

const emptyBoxStyle = {
  textAlign: 'center',
  color: '#666',
  padding: '26px',
  border: '2px dashed #444',
  borderRadius: '12px',
};

const smallBtnStyle = {
  border: 'none',
  padding: '7px 16px',
  borderRadius: '8px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

export function LskyStoragePanel({ onToast, stats = null, loading = false, error = '' }) {
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [sortMode, setSortMode] = useState('date');
  const [trash, setTrash] = useState([]);
  const [history, setHistory] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleaningKey, setCleaningKey] = useState('');
  const [autoCleaning, setAutoCleaning] = useState(false);
  const lazyCleanupStartedRef = useRef(false);

  const showToast = useCallback(
    (message, duration) => {
      if (typeof onToast === 'function') onToast(message, duration);
    },
    [onToast]
  );

  const runDeleteRequest = useCallback(async (keys) => {
    const res = await fetch('/api/admin/lsky-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ keys }),
    });
    const json = await res.json().catch(() => null);
    const results = json && Array.isArray(json.results) ? json.results : [];
    const okKeys = results.filter((r) => r && r.ok).map((r) => r.key);
    return { ok: res.ok && Boolean(json && json.success), okKeys, results };
  }, []);

  // 进入面板：惰性清理到期条目（满 7 天）→ 真删 + 留痕；失败保留并提示
  useEffect(() => {
    if (lazyCleanupStartedRef.current) return;
    lazyCleanupStartedRef.current = true;

    const run = async () => {
      const expired = listLskyTrash().filter((entry) => isLskyTrashExpired(entry));
      setTrash(listLskyTrash());
      setHistory(listLskyTrashHistory());
      if (!expired.length) return;

      setAutoCleaning(true);
      try {
        const { okKeys } = await runDeleteRequest(expired.map((e) => e.key));
        const removed = expired.filter((e) => okKeys.includes(e.key));
        if (removed.length) {
          removeLskyTrashKeys(okKeys);
          pushLskyTrashHistory(removed);
        }
        const failedCount = expired.length - removed.length;
        if (failedCount > 0) {
          showToast(`有 ${failedCount} 个到期文件清理失败，已保留稍后重试`, 3200);
        } else if (removed.length) {
          showToast(`已自动清理 ${removed.length} 个到期文件`, 2600);
        }
      } catch (_) {
        showToast('到期文件自动清理失败，稍后会重试', 3000);
      } finally {
        setTrash(listLskyTrash());
        setHistory(listLskyTrashHistory());
        setAutoCleaning(false);
      }
    };
    run();
  }, [runDeleteRequest, showToast]);

  const runScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setScanError('');
    try {
      const res = await fetch('/api/admin/lsky-scan', {
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) {
        throw new Error((json && json.error) || `扫描失败（HTTP ${res.status}）`);
      }
      setScanResult(json);
      setSelectedKeys([]);
    } catch (error) {
      setScanResult(null);
      setScanError(error instanceof Error ? error.message : '扫描失败，请稍后重试');
    } finally {
      setScanning(false);
    }
  }, [scanning]);

  const trashKeys = useMemo(
    () => new Set(trash.map((entry) => entry.key)),
    [trash]
  );

  const visibleOrphans = useMemo(() => {
    const list = ((scanResult && scanResult.orphans) || []).filter(
      (item) => !trashKeys.has(item.key)
    );
    const sorted = [...list];
    if (sortMode === 'size') {
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
    } else {
      sorted.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }
    return sorted;
  }, [scanResult, trashKeys, sortMode]);

  const allVisibleSelected =
    visibleOrphans.length > 0 &&
    visibleOrphans.every((item) => selectedKeys.includes(item.key));

  const selectedOrphans = useMemo(
    () => visibleOrphans.filter((item) => selectedKeys.includes(item.key)),
    [visibleOrphans, selectedKeys]
  );
  const selectedSizeKB = selectedOrphans.reduce((sum, item) => sum + (item.size || 0), 0);

  const toggleKey = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(visibleOrphans.map((item) => item.key));
    }
  };

  const confirmTrashSelection = () => {
    if (!selectedOrphans.length) return;
    setConfirmOpen(true);
  };

  const moveSelectionToTrash = () => {
    const now = Date.now();
    const entries = selectedOrphans.map((item) => ({
      key: item.key,
      name: item.name,
      size: item.size,
      url: item.url,
      trashedAt: now,
    }));
    addLskyTrashItems(entries);
    setTrash(listLskyTrash());
    setSelectedKeys([]);
    setConfirmOpen(false);
    showToast(`已移入回收站 ${entries.length} 个文件，7 天内可恢复`, 3000);
  };

  const restoreTrashEntry = (entry) => {
    removeLskyTrashKeys([entry.key]);
    setTrash(listLskyTrash());
    showToast('已恢复，文件未删除', 2200);
  };

  const cleanTrashEntry = async (entry) => {
    if (cleaningKey) return;
    setCleaningKey(entry.key);
    try {
      const { ok, okKeys, results } = await runDeleteRequest([entry.key]);
      const result = results[0];
      if (ok && okKeys.includes(entry.key)) {
        removeLskyTrashKeys([entry.key]);
        pushLskyTrashHistory([entry]);
        setTrash(listLskyTrash());
        setHistory(listLskyTrashHistory());
        showToast('已清理', 2000);
      } else {
        showToast((result && result.message) || '清理失败，请稍后重试', 2800);
      }
    } catch (_) {
      showToast('清理失败，请稍后重试', 2800);
    } finally {
      setCleaningKey('');
    }
  };

  const wipeHistory = () => {
    clearLskyTrashHistory();
    setHistory([]);
  };

  const statCard = (label, value, accent) => (
    <div
      key={label}
      style={{
        flex: 1,
        minWidth: '130px',
        background: '#333',
        border: '1px solid #4a4a4a',
        borderRadius: '12px',
        padding: '14px 18px',
      }}
    >
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 'bold', color: accent || '#fff' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{ background: '#424242', padding: 30, borderRadius: 20 }}>
      {/* 容量条 */}
      <GalleryStorageBar stats={stats} loading={loading} error={error} />

      {/* 标题 + 扫描 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
          🗂 存储管理
        </div>
        <button
          type="button"
          onClick={runScan}
          disabled={scanning}
          style={{
            background: scanning ? '#2a2a2e' : '#fff',
            color: scanning ? '#999' : '#000',
            border: 'none',
            padding: '11px 24px',
            borderRadius: '10px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: scanning ? 'wait' : 'pointer',
          }}
        >
          {scanning ? '扫描中，请稍候…' : scanResult ? '重新扫描' : '开始扫描'}
        </button>
      </div>

      {scanError ? (
        <div
          style={{
            color: '#ff7875',
            background: 'rgba(255,120,117,0.08)',
            border: '1px solid rgba(255,120,117,0.35)',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '12.5px',
            marginBottom: '20px',
          }}
        >
          {scanError}
        </div>
      ) : null}

      {autoCleaning ? (
        <div style={{ color: '#fbbf24', fontSize: '12.5px', marginBottom: '20px' }}>
          正在清理到期文件…
        </div>
      ) : null}

      {scanResult ? (
        <>
          {/* 统计卡 */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '30px' }}>
            {statCard('总文件', scanResult.total)}
            {statCard('总容量', formatSizeKB(scanResult.totalSizeKB))}
            {statCard('孤立文件', scanResult.orphanCount, '#f97316')}
            {statCard('孤立容量', formatSizeKB(scanResult.orphanSizeKB), '#f97316')}
          </div>

          {/* 孤立列表 */}
          <div style={sectionTitleStyle}>孤立文件（未被任何内容引用）</div>
          {scanResult.truncated ? (
            <div style={{ fontSize: '11.5px', color: '#fbbf24', marginBottom: '10px' }}>
              孤立文件较多，列表仅显示前 2000 条
            </div>
          ) : null}
          {visibleOrphans.length === 0 ? (
            <div style={{ ...emptyBoxStyle, marginBottom: '30px' }}>未发现未使用文件</div>
          ) : (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="admin-list-select-btn"
                  style={{ ...smallBtnStyle, background: '#555', color: '#eee' }}
                >
                  {allVisibleSelected ? '取消全选' : '全选'}
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { id: 'date', label: '按时间' },
                    { id: 'size', label: '按大小' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSortMode(opt.id)}
                      style={{
                        ...smallBtnStyle,
                        padding: '7px 12px',
                        fontSize: '12px',
                        background: sortMode === opt.id ? '#4a4a4a' : 'transparent',
                        color: sortMode === opt.id ? '#fff' : '#888',
                        border: `1px solid ${sortMode === opt.id ? '#666' : '#444'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={confirmTrashSelection}
                  disabled={!selectedOrphans.length}
                  style={{
                    ...smallBtnStyle,
                    background: selectedOrphans.length ? '#f97316' : '#333',
                    color: selectedOrphans.length ? '#fff' : '#666',
                  }}
                >
                  移入回收站{selectedOrphans.length ? `（${selectedOrphans.length}）` : ''}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {visibleOrphans.map((item) => {
                  const checked = selectedKeys.includes(item.key);
                  return (
                    <label
                      key={item.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: checked ? '#3a3a3a' : '#333',
                        border: `1px solid ${checked ? '#f97316' : '#4a4a4a'}`,
                        borderRadius: '10px',
                        padding: '10px 14px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKey(item.key)}
                        style={{ width: 16, height: 16, accentColor: '#f97316', flexShrink: 0 }}
                      />
                      <OrphanThumb url={item.url} name={item.name} />
                      <div style={{ flex: 1, minWidth: '140px', overflow: 'hidden' }}>
                        <div
                          style={{
                            fontSize: '13px',
                            color: '#fff',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.name}
                        >
                          {item.name || item.key}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>
                          {formatSizeKB(item.size)} · {item.date || '—'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : !scanError ? (
        <div style={{ ...emptyBoxStyle, marginBottom: '30px' }}>
          点击「开始扫描」检查未使用文件
        </div>
      ) : null}

      {/* 回收站 */}
      <div style={{ ...sectionTitleStyle, marginTop: scanResult ? '10px' : '0' }}>
        回收站（{trash.length}）
      </div>
      {trash.length === 0 ? (
        <div style={{ ...emptyBoxStyle, marginBottom: '28px' }}>回收站为空</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
          {trash.map((entry) => {
            const remaining = getLskyTrashRemainingMs(entry);
            return (
              <div
                key={entry.key}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  background: '#333',
                  border: `1px solid ${remaining <= 0 ? 'rgba(249,115,22,0.55)' : '#4a4a4a'}`,
                  borderRadius: '10px',
                  padding: '10px 14px',
                  flexWrap: 'wrap',
                }}
              >
                <OrphanThumb url={entry.url} name={entry.name} />
                <div style={{ flex: 1, minWidth: '160px', overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={entry.name}
                  >
                    {entry.name || entry.key}
                  </div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>
                    {formatSizeKB(entry.size)} · {formatRemainingLabel(remaining)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => restoreTrashEntry(entry)}
                    style={{ ...smallBtnStyle, background: '#555', color: '#eee' }}
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    onClick={() => cleanTrashEntry(entry)}
                    disabled={cleaningKey === entry.key}
                    style={{
                      ...smallBtnStyle,
                      background: cleaningKey === entry.key ? '#7a4a1e' : '#f97316',
                      color: '#fff',
                      cursor: cleaningKey === entry.key ? 'wait' : 'pointer',
                    }}
                  >
                    {cleaningKey === entry.key ? '清理中…' : '立即清理'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 清理历史 */}
      <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>已清理（{history.length}）</span>
        {history.length > 0 ? (
          <button
            type="button"
            onClick={wipeHistory}
            style={{ ...smallBtnStyle, background: 'transparent', color: '#888', border: '1px solid #444', fontSize: '11px', padding: '5px 10px' }}
          >
            清空
          </button>
        ) : null}
      </div>
      {history.length === 0 ? (
        <div style={emptyBoxStyle}>暂无清理记录</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {history.map((entry) => (
            <div
              key={`${entry.key}-${entry.deletedAt}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#2a2a2e',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '12px',
                color: '#999',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#555',
                  flexShrink: 0,
                }}
              />
              <span
                style={{ flex: 1, minWidth: '120px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                title={entry.name}
              >
                {entry.name || entry.key}
              </span>
              <span>{formatSizeKB(entry.size)}</span>
              <span style={{ color: '#666' }}>{formatTimestamp(entry.deletedAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 移入回收站二次确认 */}
      {confirmOpen ? (
        <div className="modal-bg" onClick={() => setConfirmOpen(false)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 380, padding: 26 }}
          >
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff', marginBottom: '14px' }}>
              移入回收站
            </div>
            <div style={{ fontSize: '13px', color: '#bbb', lineHeight: 1.9, marginBottom: '22px' }}>
              已选 <b style={{ color: '#f97316' }}>{selectedOrphans.length}</b> 个文件，
              共 {formatSizeKB(selectedSizeKB)}。
              <br />
              7 天后自动删除，期间可随时恢复。
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{ ...smallBtnStyle, flex: 1, background: '#444', color: '#ccc' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={moveSelectionToTrash}
                style={{ ...smallBtnStyle, flex: 1, background: '#f97316', color: '#fff' }}
              >
                移入回收站
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
