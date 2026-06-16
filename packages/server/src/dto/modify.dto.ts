import { z } from 'zod'

const OptimizationRequest = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  },
  z.object({
    field: z.string().min(1),
    current: z.string().min(1, 'current 不能为空'),
    suggestion: z.string().min(1, 'suggestion 不能为空'),
    reason: z.string().optional()
  })
)

/** POST /modify/apply 请求 */
export const ModifyRequest = z.object({
  conversationId: z.string().min(1, 'conversationId 不能为空'),
  optimization: OptimizationRequest,
  type: z.enum(['apply', 'accept']).optional(),
  clientIds: z
    .object({
      user: z.string().optional(),
      processing: z.string().optional()
    })
    .optional(),
  assistantMsgId: z.string().optional()
})

export type ModifyRequest = z.infer<typeof ModifyRequest>

/** POST /modify/render-pdf 请求 */
export const RenderPdfRequest = z.object({
  markdown: z.string().min(1, 'markdown 不能为空')
})

export type RenderPdfRequest = z.infer<typeof RenderPdfRequest>
