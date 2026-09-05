'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { FiBarChart2, FiRefreshCw } from 'react-icons/fi';

/**
 * 派工单 B3:后台「数据统计」面板。
 * - 数据源:GET /api/admin/stats(只读 RPC 聚合,近 30 天 + 今日实时);
 *   请求失败 / success=false / 无数据 → 统一显示「暂无数据」,不弹窗报错。
 * - 视觉:沿用后台灰阶(#424242 卡片 / #333 内卡 / #555 边框 / #888 辅助文字),
 *   近 7 天柱状图为纯 CSS 零依赖(灰阶 #555 柱体 / #444 轨道)。
 * - 文案纯功能描述,无 emoji。
 * - 自查(派工单 B5):仅读展示,无任何写操作;不含 ip 等敏感信息。
 */

const STAT_LABELS = [
  { key: 'pv', label: '浏览量' },
  { key: 'uv', label: '访客数' },
];

const REFERRER_LABELS = [
  { key: 'engine_pv', label: '搜索引擎' },
  { key: 'social_pv', label: '社媒' },
  { key: 'direct_pv', label: '直达' },
];

const sumField = (days, key) =>
  days.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);

const lastNDays = (days, n) => days.slice(-n);

const formatDayLabel = (day) => {
  const parts = String(day || '').split('-');
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  return day || '';
};

const StatCard = ({ label, value, hint }) => (
  <div style={{ flex: 1, minWidth: '120px', background: '#333', border: '1px solid #555', borderRadius: '12px', padding: '16px 18px' }}>
    <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>{label}</div>
    <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#fff', lineHeight: 1.1 }}>{value}</div>
    {hint ? <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>{hint}</div> : null}
  </div>
);

/** 近 7 天柱状图:纯 CSS,零依赖;灰阶 #555 柱体、#444 轨道 */
const WeekBars = ({ days }) => {
  const rows = lastNDays(days, 7);
  if (rows.length === 0) return null;
  const maxPv = Math.max(1, ...rows.map((row) => Number(row.pv) || 0));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '150px', padding: '0 4px' }}>
        {rows.map((row) => {
          const pv = Number(row.pv) || 0;
          const heightPct = Math.round((pv / maxPv) * 100);
          return (
            <div
              key={row.day}
              title={`${row.day} · 浏览 ${pv} · 访客 ${Number(row.uv) || 0}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}
            >
              <div style={{ fontSize: '11px', color: '#888' }}>{pv}</div>
              <div style={{ width: '100%', height: '110px', background: '#444', borderRadius: '6px 6px 4px 4px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: pv > 0 ? `${Math.max(heightPct, 4)}%` : '0%', background: '#555', borderRadius: '6px 6px 4px 4px', transition: 'height 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>{formatDayLabel(row.day)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function StatsPanel() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [today, setToday] = useState(null);
  const [days, setDays] = useState([]);

  const loadStats = useCallback(async (silent) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data && data.success) {
        setFailed(false);
        setFromDay(data.fromDay || '');
        setToDay(data.toDay || '');
        setToday(data.today || null);
        setDays(Array.isArray(data.days) ? data.days : []);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats(false);
  }, [loadStats]);

  const todayHasData = Boolean(
    today && (today.pv > 0 || today.uv > 0)
  );
  const totalPv = sumField(days, 'pv');
  const totalUv = sumField(days, 'uv');

  return (
    <div style={{ background: '#424242', padding: 30, borderRadius: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FiBarChart2 size={20} color="#fff" />
          <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>数据统计</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {fromDay ? (
            <span style={{ fontSize: '12px', color: '#888' }}>
              {fromDay} 至 {toDay}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => loadStats(true)}
            disabled={refreshing || loading}
            title="刷新统计数据"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#555',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: refreshing || loading ? 'wait' : 'pointer',
              opacity: refreshing || loading ? 0.6 : 1,
            }}
          >
            <FiRefreshCw size={14} style={{ animation: refreshing ? 'imgspin 0.8s linear infinite' : 'none' }} />
            刷新
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: '30px' }}>加载中...</div>
      ) : failed ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '40px', border: '2px dashed #444', borderRadius: '12px' }}>
          暂无数据
        </div>
      ) : (
        <>
          {/* 今日实时 */}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '22px' }}>
            <StatCard label="今日浏览" value={todayHasData ? today.pv : '—'} />
            <StatCard label="今日访客" value={todayHasData ? today.uv : '—'} />
            {!todayHasData ? (
              <div style={{ flex: 2, minWidth: '220px', background: '#333', border: '1px solid #555', borderRadius: '12px', padding: '16px 18px', display: 'flex', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '6px' }}>数据采集中</div>
                  <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.7 }}>
                    今日尚无访客记录,有读者访问后此处显示实时浏览与访客数。
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* 近 7 天柱状 */}
          <div style={{ background: '#333', border: '1px solid #555', borderRadius: '12px', padding: '18px 20px', marginBottom: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>近 7 天浏览</span>
              <span style={{ fontSize: '11px', color: '#888' }}>合计 {sumField(lastNDays(days, 7), 'pv')} 次</span>
            </div>
            {days.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', padding: '26px', border: '2px dashed #444', borderRadius: '12px' }}>数据采集中</div>
            ) : (
              <WeekBars days={days} />
            )}
          </div>

          {/* 近 30 天汇总表 */}
          <div style={{ background: '#333', border: '1px solid #555', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '14px' }}>近 30 天汇总</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '420px' }}>
                <thead>
                  <tr>
                    {['浏览量', '访客数', '搜索引擎', '社媒', '直达'].map((label) => (
                      <th key={label} style={{ textAlign: 'right', color: '#888', fontWeight: 'bold', padding: '8px 10px', borderBottom: '1px solid #555' }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {[totalPv, totalUv, sumField(days, 'engine_pv'), sumField(days, 'social_pv'), sumField(days, 'direct_pv')].map((value, i) => (
                      <td key={i} style={{ textAlign: 'right', color: '#fff', fontWeight: 'bold', padding: '10px 10px' }}>
                        {value}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    {[totalPv, totalUv, sumField(days, 'engine_pv'), sumField(days, 'social_pv'), sumField(days, 'direct_pv')].map((value, i) => (
                      <td key={i} style={{ textAlign: 'right', color: '#888', fontSize: '11px', padding: '0 10px 8px' }}>
                        {totalPv > 0 && i >= 2 ? `${Math.round((value / totalPv) * 100)}%` : ''}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
