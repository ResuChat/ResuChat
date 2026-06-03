import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { getChatModel } from '../../../lib/providers'

export async function classifyIntent(query: string): Promise<'建议' | '修改' | '追问'> {
  const intentParser = StructuredOutputParser.fromNamesAndDescriptions({
    intent: '建议、修改 或 追问'
  })
  try {
    const response = await getChatModel().invoke([
      {
        role: 'user',
        content: `判断用户对简历的操作意图。
${intentParser.getFormatInstructions()}

"建议"：用户要求分析简历、提改进方向、哪里可以优化，没有指定具体怎么改。即使用户说"请分析这份简历"、"帮我看看"、"有什么建议"、"提点意见"、"你觉得呢"等笼统表达，只要涉及简历分析或优化需求，都应归为"建议"。
"修改"：用户明确要求对某个具体字段做直接修改（如"把XX改详细"、"简化XX"、"补充XX内容"）。
"追问"：用户的表达完全无关或过于模糊，既不像在要求分析简历，也不像要修改具体字段（如只说"你好"、"在吗"、"不知道"等无实质内容的招呼）。不要因为用户没说具体要改哪里就输出"追问"。

用户问题: ${query}`
      }
    ])
    const parsed = await intentParser.parse(
      typeof response.content === 'string' ? response.content : ''
    )
    const intent = parsed.intent === '修改' ? '修改' : parsed.intent === '追问' ? '追问' : '建议'
    console.log('[DEBUG] intent classified:', intent, '| query:', query.slice(0, 50))
    return intent
  } catch (e) {
    console.error('Failed to classify intent, defaulting to 建议:', e)
    return '建议'
  }
}
