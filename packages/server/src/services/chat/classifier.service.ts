import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { getChatModel } from '../../lib/ai/providers'
import { buildIntentClassifyPrompt, buildFileClassifyPrompt } from '../../lib/ai/prompts'
import { logger } from '../../lib/logger'

export type ContentCategory = 'resume' | 'job' | 'unknown'

/** 判断用户对简历的操作意图 */
export async function classifyIntent(
  query: string,
  contextMessages?: { role: 'user' | 'assistant'; content: string }[]
): Promise<'建议' | '修改' | '追问'> {
  const intentParser = StructuredOutputParser.fromNamesAndDescriptions({
    intent: '建议、修改 或 追问'
  })
  try {
    const response = await getChatModel().invoke([
      {
        role: 'user',
        content: buildIntentClassifyPrompt(
          query,
          intentParser.getFormatInstructions(),
          contextMessages
        )
      }
    ])
    const parsed = await intentParser.parse(
      typeof response.content === 'string' ? response.content : ''
    )
    const intent = parsed.intent === '修改' ? '修改' : parsed.intent === '追问' ? '追问' : '建议'
    logger.debug('Chat intent classified', { intent, queryPreview: query.slice(0, 50) })
    return intent
  } catch (error) {
    logger.warn('Chat intent classification failed, defaulting to suggestion', { error })
    return '建议'
  }
}

/** 判断文件内容属于哪类参考资料 */
export async function classifyReferenceFile(content: string): Promise<ContentCategory> {
  const refParser = StructuredOutputParser.fromNamesAndDescriptions({
    category: 'resume | job | unknown'
  })
  try {
    const response = await getChatModel().invoke([
      {
        role: 'user',
        content: buildFileClassifyPrompt(content, refParser.getFormatInstructions())
      }
    ])
    const parsed = await refParser.parse(
      typeof response.content === 'string' ? response.content : ''
    )
    return parsed.category === 'resume' || parsed.category === 'job' ? parsed.category : 'unknown'
  } catch (error) {
    logger.warn('Reference file classification failed', { error })
    return 'unknown'
  }
}
