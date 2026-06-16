import { Request, Response } from 'express'
import { ValidationError } from '../../lib/errors'
import type { MulterFile } from '../../lib/file-content'
import { buildRagContext } from './context.service'
import { SearchStreamPersistence } from './stream-persistence.service'
import { prepareConversationForSearch } from './conversation-preparation.service'
import { prepareSearchPromptPlan } from './search-prompt.service'
import { executeSearchStream } from './search-execution.service'
import { logger } from '../../lib/logger'

export async function performSearch(
  reqBody: {
    query: string
    displayText?: string
    files?: MulterFile[]
    docIds?: number[]
    k?: number
    conversationId: string
    userMsgId?: string
    assistantMsgId?: string
  },
  res: Response,
  req: Request,
  userId: string
) {
  const { query, displayText, files, docIds, conversationId, userMsgId, assistantMsgId } = reqBody

  if (!query) {
    throw new ValidationError('query is required')
  }

  await prepareConversationForSearch({ conversationId, query })

  const context = await buildRagContext({
    query,
    files,
    docIds,
    conversationId,
    userId
  })
  const { searchPrompt, tools } = await prepareSearchPromptPlan({
    query,
    conversationId,
    resumeContent: context.resumeContent,
    excellentResumeContent: context.excellentResumeContent,
    referenceDocContent: context.referenceDocContent
  })

  logger.debug('Search stream starting', { conversationId, toolCount: Object.keys(tools).length })

  const streamPersistence = await SearchStreamPersistence.create({
    conversationId,
    query,
    displayText,
    attachments: context.attachments,
    userMsgId,
    assistantMsgId
  })

  streamPersistence.attachAbortHandlers(req, res)

  executeSearchStream({
    res,
    assistantMsgId,
    tools,
    prompt: searchPrompt,
    streamPersistence
  })
}
