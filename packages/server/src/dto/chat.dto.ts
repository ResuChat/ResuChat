import { z } from 'zod'

const jsonArrayOfNumbers = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, z.array(z.coerce.number().int()))

/** POST /chat/search 请求 */
export const SearchRequest = z.object({
  query: z.string().trim().min(1, 'query 不能为空'),
  displayText: z.string().optional(),
  k: z.coerce.number().int().optional(),
  conversationId: z.string().trim().min(1, 'conversationId 不能为空'),
  userMsgId: z.string().optional(),
  assistantMsgId: z.string().optional(),
  docIds: jsonArrayOfNumbers.optional()
})

export type SearchRequest = z.infer<typeof SearchRequest>

/** POST /chat/summarize 请求 */
export const SummarizeRequest = z.object({
  conversationId: z.string().min(1)
})

export type SummarizeRequest = z.infer<typeof SummarizeRequest>
