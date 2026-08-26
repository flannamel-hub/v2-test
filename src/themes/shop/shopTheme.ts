/** shop（商城）主题代号判断；resolveThemeId 负责('shop'/'mall' → 'shop') */
export function isShopTheme(code: string | null | undefined): boolean {
  const c = (code || '').trim().toLowerCase()
  return c === 'shop' || c === 'mall'
}
