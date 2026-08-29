import type { CSSProperties } from 'react'

/**
 * Tweet 卡片 tag 创作者暖色系色板(P18TWEET-4)。
 * 按 tag 名哈希稳定取色;同一 RGB 深/浅主题共用,
 * 底色透明度与文字色由 tweet-theme.css 分主题控制,保证可读性。
 */
const TAG_PALETTE: Array<{ rgb: string; ink: string }> = [
  { rgb: '245 158 11', ink: '#92400e' }, // 琥珀
  { rgb: '251 146 60', ink: '#9a3412' }, // 蜜橙
  { rgb: '251 113 133', ink: '#9f1239' }, // 玫粉
  { rgb: '196 181 253', ink: '#5b21b6' }, // 藕紫
  { rgb: '202 168 92', ink: '#713f12' }, // 奶油金
]

export function tweetTagPaletteIndex(name: string): number {
  try {
    let sum = 0
    for (const char of name) sum += char.charCodeAt(0)
    return sum % TAG_PALETTE.length
  } catch {
    return 0
  }
}

/** 注入 `--tweet-tag-rgb`(底色)与 `--tweet-tag-ink`(浅色主题文字色)两个 CSS 变量 */
export function tweetTagCssVars(name: string): CSSProperties {
  const color = TAG_PALETTE[tweetTagPaletteIndex(name)] ?? TAG_PALETTE[0]
  return {
    '--tweet-tag-rgb': color.rgb,
    '--tweet-tag-ink': color.ink,
  } as CSSProperties
}
