import type { ToolSet } from 'ai'
import { buildSearchPrompt } from '../../lib/ai/prompts'
import { updateResumeTool, proposeModificationTool } from '../../lib/ai/tools'
import { buildHistoryPrompt, getRecentConversationContextMessages } from '../../storage/repository'
import { classifyIntent } from './classifier.service'
import { logger } from '../../lib/logger'

export interface SearchPromptPlan {
  searchPrompt: string
  tools: ToolSet
  intent: '建议' | '修改' | '追问'
}

export async function prepareSearchPromptPlan(params: {
  query: string
  conversationId: string
  resumeContent: string
  excellentResumeContent: string
  referenceDocContent: string
}): Promise<SearchPromptPlan> {
  const { query, conversationId, resumeContent, excellentResumeContent, referenceDocContent } =
    params

  const history = await buildHistoryPrompt(conversationId)
  const historySection = history ? `\n对话历史:\n${history}\n` : ''

  const resumeSection = resumeContent ? `【待修改简历】\n${resumeContent}\n\n` : ''
  const excellentResumeSection = excellentResumeContent
    ? `【优秀简历范例】\n${excellentResumeContent}\n\n`
    : ''
  const referenceDocSection = referenceDocContent
    ? `【岗位参考资料】\n${referenceDocContent}\n\n`
    : ''

  const intentStartedAt = Date.now()
  const contextMessages = await getRecentConversationContextMessages(conversationId, 4)
  const intent = await classifyIntent(query, contextMessages)
  logger.debug('Search prompt intent classified', {
    conversationId,
    intent,
    contextMessageCount: contextMessages.length,
    durationMs: Date.now() - intentStartedAt
  })

  const tools: ToolSet =
    intent === '追问'
      ? {}
      : {
          updateResume: updateResumeTool,
          proposeModification: proposeModificationTool
        }
  logger.debug('Search prompt tools registered', {
    conversationId,
    tools: Object.keys(tools)
  })

  const promptStartedAt = Date.now()
  const searchPrompt = await buildSearchPrompt({
    historySection,
    resumeSection,
    excellentResumeSection,
    referenceDocSection,
    query,
    intent
  })
  logger.debug('Search prompt built', {
    conversationId,
    intent,
    durationMs: Date.now() - promptStartedAt,
    promptLength: searchPrompt.length,
    promptPreview: searchPrompt.slice(0, 300)
  })

  return {
    searchPrompt,
    tools,
    intent
  }
}
