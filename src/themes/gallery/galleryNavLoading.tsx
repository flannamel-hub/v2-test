'use client'

/**
 * 覆盖在封面上的轻量加载动画（半透明遮罩 + 旋转环），需父级为 relative。
 * loading 态来源是全站单例 PostNavStallGuard（usePostNavLoading）；
 * 卡住兜底由全站 3 秒弹窗接管，本组件不再承载 stalled/reloading 提示。
 */
export function GalleryCardLoading({ loading = false }: { loading?: boolean }) {
  if (!loading) return null
  return (
    <span
      className="gallery-card-loading pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-black/25"
      aria-hidden="true"
    >
      <span className="gallery-card-spinner" />
    </span>
  )
}
