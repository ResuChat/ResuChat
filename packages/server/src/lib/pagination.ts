/**
 * 共享分页工具
 */

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * 执行 COUNT + LIMIT/OFFSET 分页查询
 */
export function paginate<T>(
  db: any,
  countSql: string,
  countParams: any[],
  dataSql: string,
  dataParams: any[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const safePage = Math.min(Math.max(1, page), 10000)
  const safeSize = Math.min(Math.max(pageSize, 1), 200)
  const offset = (safePage - 1) * safeSize

  const { cnt } = db.prepare(countSql).get(...countParams) as { cnt: number }
  const rows = db.prepare(dataSql).all(...dataParams, safeSize, offset) as T[]

  return {
    data: rows,
    total: cnt,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.ceil(cnt / safeSize)
  }
}

/**
 * 从 query string 解析分页参数
 */
export function parsePageParams(query: any, defaultSize = 20) {
  const page = Math.max(1, parseInt(String(query.page || '1')))
  const pageSize = Math.min(
    Math.max(1, parseInt(String(query.pageSize || String(defaultSize)))),
    100
  )
  return { page, pageSize }
}
