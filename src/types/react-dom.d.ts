/**
 * react-dom 最小类型声明(@types/react-dom 未安装的过渡补丁)。
 * 全仓对 react-dom 的使用只有 createPortal;补齐后同时消除既有 TS7016 基线。
 */
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react'
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null
  ): ReactPortal
}
