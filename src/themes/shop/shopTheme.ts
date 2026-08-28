/** shop（商城）主题系代号判断；resolveThemeId 负责('shop'/'mall' → 'shop','shop-v2'/'shopv2' → 'shop-v2') */
export function isShopTheme(code: string | null | undefined): boolean {
  const c = (code || '').trim().toLowerCase()
  return c === 'shop' || c === 'mall' || c === 'shop-v2' || c === 'shopv2'
}
