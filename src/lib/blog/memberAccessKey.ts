/**
 * 站点会员 B4 验收修正:访问串规范化拆出客户端安全模块。
 * - 纯函数、零依赖、零 import;禁止在此引入任何 Node 内置协议模块或服务端模块
 *   (中心客户端工具模块顶层含 Node 内置依赖,客户端组件不得引用);
 * - 服务端既有引用经该模块的 re-export 保持零改动兼容。
 */

/** 访问串规范化(与中心同规则):去空白/全角空格/各类连字符 → 大写 */
export function normalizeMemberAccessKey(raw: string): string {
  return (raw || '').replace(/[\s\u3000\-－–—]/g, '').toUpperCase()
}
