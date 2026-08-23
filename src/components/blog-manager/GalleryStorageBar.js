/** 后台首页：图库容量条（Supabase 记录的压缩后体积） */

function barColor(percent) {
  if (percent >= 95) return '#ff4d4f'
  if (percent >= 80) return '#f59e0b'
  return 'greenyellow'
}

/** BLOG 分层 P4「本月用量」阈值灯:0-69 绿 / 70-99 黄 / >=100 红(与平台判定一致) */
function quotaLightColor(pct) {
  if (pct >= 100) return '#ff4d4f'
  if (pct >= 70) return '#f59e0b'
  return '#52c41a'
}

function quotaPctLabel(pct) {
  const n = Math.max(0, Number(pct) || 0)
  if (n < 0.01) return '0%'
  if (n < 1) return `${n.toFixed(2)}%`
  return `${n.toFixed(1)}%`
}

function QuotaMetricRow({ label, pct }) {
  const width = Math.min(100, Math.max(0, Number(pct) || 0))
  const color = quotaLightColor(Number(pct) || 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span
        style={{
          width: '34px',
          fontSize: '12px',
          color: '#999',
          flexShrink: 0,
          textAlign: 'right',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: '8px',
          background: '#1a1a1e',
          borderRadius: '999px',
          overflow: 'hidden',
          border: '1px solid #333',
        }}
      >
        <div
          style={{
            width: `${width}%`,
            minWidth: width > 0 ? '1px' : 0,
            height: '100%',
            background: color,
            borderRadius: '999px',
            transition: 'width 0.35s ease',
          }}
        />
      </div>
      <span style={{ width: '52px', fontSize: '12px', color: '#ccc', flexShrink: 0 }}>
        {quotaPctLabel(pct)}
      </span>
      <span
        aria-hidden
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          background: color,
          boxShadow: `0 0 6px ${color}88`,
          flexShrink: 0,
        }}
      />
    </div>
  )
}

/** 真实字节比例（0–100），避免把 MB 数值误当 GB 比例 */
function usagePercentFromBytes(usedBytes, quotaBytes, fallbackPercent) {
  const used = Math.max(0, Number(usedBytes) || 0)
  const quota = Math.max(0, Number(quotaBytes) || 0)
  if (quota <= 0) return 0
  if (used <= 0) return 0
  const exact = (used / quota) * 100
  if (Number.isFinite(exact)) return Math.min(100, exact)
  return Math.min(100, Math.max(0, Number(fallbackPercent) || 0))
}

function formatUsagePercent(usedBytes, pct) {
  if ((Number(usedBytes) || 0) <= 0 || pct <= 0) return '0%'
  if (pct < 0.01) return '< 0.01%'
  if (pct < 1) return `${pct.toFixed(2)}%`
  return `${pct.toFixed(1)}%`
}

export function GalleryStorageBar({ stats, loading, error }) {
  if (loading) {
    return (
      <div
        style={{
          marginBottom: '20px',
          padding: '16px 20px',
          background: '#2a2a2e',
          borderRadius: '12px',
          border: '1px solid #444',
          color: '#888',
          fontSize: '13px',
        }}
      >
        图库容量加载中…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          marginBottom: '20px',
          padding: '16px 20px',
          background: '#2a2a2e',
          borderRadius: '12px',
          border: '1px solid #553333',
          color: '#ff7875',
          fontSize: '12px',
        }}
      >
        图库容量不可用：{error}
      </div>
    )
  }

  if (!stats?.configured) {
    return (
      <div
        style={{
          marginBottom: '20px',
          padding: '16px 20px',
          background: '#2a2a2e',
          borderRadius: '12px',
          border: '1px solid #444',
          color: '#888',
          fontSize: '12px',
          lineHeight: 1.6,
        }}
      >
        图库容量统计暂未启用。
      </div>
    )
  }

  const pct = usagePercentFromBytes(
    stats.usedBytes,
    stats.quotaBytes,
    stats.usedPercent
  )
  const pctLabel = formatUsagePercent(stats.usedBytes, pct)
  const full = pct >= 100

  return (
    <div
      style={{
        marginBottom: '20px',
        padding: '16px 20px',
        background: '#2a2a2e',
        borderRadius: '12px',
        border: '1px solid #444',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ccc' }}>
          图库容量
        </span>
        <span style={{ fontSize: '12px', color: '#999' }}>
          {stats.imageCount} 张 · {pctLabel} 已用
        </span>
      </div>
      <div
        style={{
          height: '10px',
          background: '#1a1a1e',
          borderRadius: '999px',
          overflow: 'hidden',
          border: '1px solid #333',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            minWidth: pct > 0 ? '1px' : 0,
            height: '100%',
            background: barColor(pct),
            borderRadius: '999px',
            transition: 'width 0.35s ease',
            boxShadow: pct >= 0.5 ? `0 0 12px ${barColor(pct)}55` : 'none',
          }}
        />
      </div>

      {full && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '11px',
            color: '#ff7875',
            textAlign: 'right',
          }}
        >
          已达容量上限，无法继续上传图库图片
        </div>
      )}

      {stats.quota ? (
        <div
          style={{
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid #3a3a3e',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ccc' }}>
              本月用量
            </span>
            {stats.quota.status === 'read_only' || stats.quota.readOnly ? (
              <span style={{ fontSize: '11px', color: '#ff4d4f', fontWeight: 'bold' }}>
                本月用量已达上限，站点暂为只读状态
              </span>
            ) : stats.quota.status === 'warning' ? (
              <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                用量较高，请注意控制
              </span>
            ) : null}
          </div>
          <QuotaMetricRow label="访问" pct={stats.quota.pvPct} />
          <QuotaMetricRow label="带宽" pct={stats.quota.bwPct} />
          <QuotaMetricRow label="图库" pct={stats.quota.galleryPct} />
        </div>
      ) : null}
    </div>
  )
}
