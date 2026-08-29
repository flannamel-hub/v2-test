/** Category badge colors · aligned with morethan-log Category/constants */
const COLOR_SET: Record<string, string> = {
  '0': 'rgb(186 230 253)',
  '1': 'rgb(254 205 211)',
  '2': 'rgb(245 208 254)',
  '3': 'rgb(221 214 254)',
  '4': 'rgb(191 219 254)',
  '5': 'rgb(204 251 241)',
  '6': 'rgb(187 247 208)',
  '7': 'rgb(254 249 195)',
  '8': 'rgb(186 230 253)',
  '9': 'rgb(254 202 202)',
  A: 'rgb(231 229 228)',
  B: 'rgb(226 232 240)',
  C: 'rgb(252 231 243)',
  D: 'rgb(233 213 255)',
  E: 'rgb(199 210 254)',
  F: 'rgb(209 250 229)',
}

export function tweetCategoryColor(name: string): string {
  try {
    let sum = 0
    for (const char of name) sum += char.charCodeAt(0)
    const key = sum.toString(16).slice(-1).toUpperCase()
    return COLOR_SET[key] ?? COLOR_SET['0']
  } catch {
    return COLOR_SET['0']
  }
}

/** 供 CSS `rgb(var(--tweet-cat-rgb) / a)` 使用的 "R G B" 三元组(分类胶囊配色) */
export function tweetCategoryRgbTriple(name: string): string {
  const parts = tweetCategoryColor(name).match(/\d+/g)
  if (parts && parts.length >= 3) return `${parts[0]} ${parts[1]} ${parts[2]}`
  return '226 232 240'
}
