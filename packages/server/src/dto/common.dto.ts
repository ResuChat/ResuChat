import { z } from 'zod'
import { MAX_PAGE_SIZE } from '../lib/config'

/** 分页查询参数 */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional()
})

export type PaginationQuery = z.infer<typeof PaginationQuery>

/** 会话 ID 参数（conv_xxx 字符串） */
export const ConversationIdParam = z.object({
  id: z.string().min(1)
})

export type ConversationIdParam = z.infer<typeof ConversationIdParam>

/** 数字 ID 参数（refId / docId / notification id / admin document id） */
export const NumericIdParam = z.object({
  id: z.coerce.number().int().positive()
})

export type NumericIdParam = z.infer<typeof NumericIdParam>

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
