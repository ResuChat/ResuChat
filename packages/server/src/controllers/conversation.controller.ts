import type { Request, RequestHandler, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { ValidatedQueryRequest } from '../middleware/validate'
import { UnauthorizedError } from '../lib/errors'
import { parsePageParams } from '../lib/pagination'
import type { MulterFile } from '../lib/file-content'
import type { MessagesQuery } from '../dto/conversation.dto'
import { UPLOAD_TIMEOUT } from '../lib/config'
import {
  deleteConversationById,
  getConversationMessages,
  listDeletedConversationsForUser,
  listConversationsForUser,
  restoreDeletedConversation,
  startConversation,
  uploadProgress
} from '../services/document/conversation.service'

export const listConversations: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const { page, pageSize } = parsePageParams(req.query, 20)
  const result = await listConversationsForUser(userId, page, pageSize)
  res.json({
    data: result.data,
    pagination: { page: result.page, pageSize: result.pageSize, total: result.total }
  })
}

export const listDeletedConversations: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const { page, pageSize } = parsePageParams(req.query, 20)
  const result = await listDeletedConversationsForUser(userId, page, pageSize)
  res.json({
    data: result.data,
    pagination: { page: result.page, pageSize: result.pageSize, total: result.total }
  })
}

export const getMessages: RequestHandler = async (req: Request, res: Response) => {
  const conversationId = String(req.params.id)
  const query = (req as ValidatedQueryRequest<MessagesQuery>).validatedQuery!
  const beforeId = query.before
  const page = query.page
  const pageSize = query.pageSize ?? 100
  const order = query.order
  const result = await getConversationMessages({
    conversationId,
    beforeId,
    page,
    pageSize,
    order
  })
  res.json(result)
}

export const deleteConv: RequestHandler = async (req: Request, res: Response) => {
  const conversationId = String(req.params.id)
  await deleteConversationById(conversationId)
  res.json({ message: 'Conversation deleted' })
}

export const restoreConv: RequestHandler = async (req: Request, res: Response) => {
  const conversationId = String(req.params.id)
  await restoreDeletedConversation(conversationId)
  res.json({ message: 'Conversation restored' })
}

// ===== 会话启动（文件上传） =====

export async function getProgress(req: Request, res: Response) {
  const data = uploadProgress.get(String(req.params.convId))
  if (!data) return res.json({ progress: 0, status: '等待开始...' })
  res.json(data)
}

export const start: RequestHandler = async (req: Request, res: Response) => {
  req.setTimeout(UPLOAD_TIMEOUT)

  const files = req.files as MulterFile[] | undefined
  const query = (req.body.query as string) || ''
  const docId = req.body.docId ? Number(req.body.docId) : undefined
  const conversationId = req.body.conversationId ? String(req.body.conversationId) : undefined
  const userId = (req as AuthRequest).auth?.userId

  if (!userId) {
    throw new UnauthorizedError('Authentication required')
  }

  const result = await startConversation(files, query, userId, undefined, docId, conversationId)
  res.json(result)
}
