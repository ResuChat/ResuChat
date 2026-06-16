import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './config'

/**
 * 分页参数解析（纯工具函数，无 DB 依赖）
 */

export function parsePageParams(query: Record<string, unknown>, defaultSize = DEFAULT_PAGE_SIZE) {
  const page = Math.max(1, parseInt(String(query.page || '1')))
  const pageSize = Math.min(
    Math.max(1, parseInt(String(query.pageSize || String(defaultSize)))),
    MAX_PAGE_SIZE
  )
  return { page, pageSize }
}
