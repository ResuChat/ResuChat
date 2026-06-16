import { getChatModel } from '../../lib/ai/providers'
import { buildTitlePrompt } from '../../lib/ai/prompts'
import { getConversationTitle, updateConversationTitle } from '../../storage/repository'
import { logger } from '../../lib/logger'

export async function prepareConversationForSearch(params: {
  conversationId: string
  query: string
}): Promise<{ conversationId: string }> {
  const { conversationId, query } = params

  const title = await getConversationTitle(conversationId)
  if (!title) {
    try {
      const response = await getChatModel().invoke([
        { role: 'user', content: await buildTitlePrompt(query) }
      ])
      const titleText = typeof response.content === 'string' ? response.content : ''
      await updateConversationTitle(conversationId, titleText.trim())
      logger.debug('Conversation title generated', { conversationId, title: titleText.trim() })
    } catch (error) {
      logger.warn('Conversation title generation failed', { conversationId, error })
    }
  }

  return { conversationId }
}
