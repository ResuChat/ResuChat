import type { Request, RequestHandler, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { ValidationError } from '../lib/errors'
import { performSearch } from '../services/chat/search.service'
import { generateConversationSummary } from '../services/chat/summary.service'
import type { MulterFile } from '../lib/file-content'

export const search: RequestHandler = async (req: Request, res: Response) => {
  const { query, displayText, k, conversationId, userMsgId, assistantMsgId, docIds } = req.body

  const files = req.files as MulterFile[] | undefined
  const userId = (req as AuthRequest).auth!.userId

  await performSearch(
    {
      query,
      displayText,
      files,
      k,
      conversationId,
      userMsgId,
      assistantMsgId,
      docIds
    },
    res,
    req,
    userId
  )
}

export const summarize: RequestHandler = async (req: Request, res: Response) => {
  const { conversationId } = req.body
  if (!conversationId) {
    throw new ValidationError('conversationId is required')
  }
  const summary = await generateConversationSummary(conversationId)
  res.json({ message: 'Summary generated', summary })
}
