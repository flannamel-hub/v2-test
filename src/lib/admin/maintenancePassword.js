const DEFAULT_MAINTENANCE_PASSWORD = '123456.'

export function getAdminMaintenancePassword() {
  const fromEnv =
    process.env.ADMIN_MAINTENANCE_PASSWORD?.trim() ||
    process.env.ADMIN_FULL_REDEPLOY_PASSWORD?.trim() ||
    ''
  if (fromEnv) return fromEnv
  // 2026-09-30 图库手术批 3a：生产环境不再回退默认值（fail-closed）；
  // dev 保留默认值便于本地开发。
  if (process.env.NODE_ENV === 'production') return null
  return DEFAULT_MAINTENANCE_PASSWORD
}

export function readAdminMaintenancePassword(req, body = req?.body) {
  const bodyPassword = typeof body?.password === 'string' ? body.password : ''
  const maintenanceHeader = req?.headers?.['x-admin-maintenance-password']
  const redeployHeader = req?.headers?.['x-full-redeploy-password']
  const headerPassword =
    typeof maintenanceHeader === 'string'
      ? maintenanceHeader
      : typeof redeployHeader === 'string'
        ? redeployHeader
        : ''

  return (bodyPassword || headerPassword).trim()
}

export function verifyAdminMaintenancePassword(req, body) {
  const expected = getAdminMaintenancePassword()
  if (!expected) return false
  return readAdminMaintenancePassword(req, body) === expected
}
