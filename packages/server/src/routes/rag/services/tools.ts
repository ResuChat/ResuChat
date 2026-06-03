import { tool } from 'ai'
import { z } from 'zod'

export const updateResumeTool = tool({
  description:
    '适用于用户笼统询问简历优化建议的场景（如"有什么建议"、"哪里需要优化"、"帮我分析"等）。每次只输出一条建议，可多次调用此工具输出多条建议。suggestion 填入简短修改建议即可。如果是要求具体修改某字段的内容，请使用 proposeModification。注意：field 必须是简历内容中的字段，不要对参考资料中的内容提出修改建议。current 从原文中精确复制要修改的文本片段，必须保证在整篇简历中唯一匹配。reason 简要说明为什么建议这样修改。',
  inputSchema: z.object({
    field: z.string(),
    current: z.string(),
    suggestion: z.string(),
    reason: z.string(),
    priority: z.string()
  }),
  execute: async ({ field, current, suggestion, reason, priority }) => ({
    optimization: { field, current, suggestion, reason, priority }
  })
})

export const proposeModificationTool = tool({
  description:
    '当用户提出具体修改指令时调用（如"把XX改详细"、"简化XX"）。suggestion 填入修改后的完整段落。current 从原文中精确复制要修改的文本片段，必须保证在整篇简历中唯一匹配。reason 简要说明为什么这样修改。注意：field 必须是简历内容中的字段，不能是参考资料中的内容。只修改简历，不修改参考资料。',
  inputSchema: z.object({
    field: z.string(),
    current: z.string(),
    suggestion: z.string(),
    reason: z.string()
  }),
  execute: async ({ field, current, suggestion, reason }) => ({
    modification: { field, current, suggestion, reason }
  })
})
