import { z } from 'zod'

/** 分页查询参数 */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(500).optional()
})

export type PaginationQuery = z.infer<typeof PaginationQuery>

/** 通用分页响应 */
export const PaginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      pageSize: z.number(),
      total: z.number()
    })
  })

/** 错误响应 */
export const ErrorResponse = z.object({
  error: z.string()
})

export type ErrorResponse = z.infer<typeof ErrorResponse>
