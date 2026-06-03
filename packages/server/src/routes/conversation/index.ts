import { Router, Request, Response } from 'express'

import { verifyToken, createAuthWithUserMiddleware } from '../../auth/token'
import {
  getUserIdByPhone,
  getUserConversations,
  getConversationMessages,
  getConversationDocuments,
  getConversationTitle,
  isConversationOwner,
  deleteConversation,
  restoreConversation
} from '../../storage/repository'
import { getDatabase } from '../../storage/database'
import { parsePageParams } from '../../lib/pagination'

const router: Router = Router()
const authWithUser = createAuthWithUserMiddleware()

// 获取会话列表
router.get('/', authWithUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const { page, pageSize } = parsePageParams(req.query, 20)

    const result = await getUserConversations(userId, page, pageSize)
    res.json({
      data: result.data,
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total }
    })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 获取会话消息 + 绑定文档
router.get('/:id/messages', authWithUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number
    const conversationId = String(req.params.id)

    const isOwner = await isConversationOwner(conversationId, userId)
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    const { page, pageSize } = parsePageParams(req.query, 100)
    const order = (req.query.order as 'ASC' | 'DESC') || 'DESC'

    const [messagesResult, documents] = await Promise.all([
      getConversationMessages(conversationId, page, pageSize, order),
      getConversationDocuments(conversationId)
    ])
    const db = getDatabase()
    const originalRef = db
      .prepare(
        'SELECT content_snapshot FROM conversation_document_refs WHERE conversation_id = ? AND content_snapshot IS NOT NULL ORDER BY created_at DESC LIMIT 1'
      )
      .get(conversationId) as { content_snapshot: string } | undefined
    const title = await getConversationTitle(conversationId)

    res.json({
      data: {
        messages: messagesResult.data,
        documents,
        initialPrompt: messagesResult.initialPrompt,
        title,
        resumeContent: originalRef?.content_snapshot || '',
        originalRefId: documents.find((d: any) => d.docType === 'original')?.id || 0
      },
      pagination: { page, pageSize, total: messagesResult.total }
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 删除会话（软删除）
router.delete('/:id', authWithUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number
    const conversationId = String(req.params.id)

    const isOwner = await isConversationOwner(conversationId, userId)
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    await deleteConversation(conversationId)
    res.json({ message: 'Conversation deleted' })
  } catch (error) {
    console.error('Error deleting conversation:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 恢复已删除会话
router.post('/:id/restore', authWithUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number
    const conversationId = String(req.params.id)

    // 恢复需要检查所有权但不排除已删除记录
    const db = getDatabase()
    const row = db
      .prepare('SELECT COUNT(*) as cnt FROM conversations WHERE id = ? AND user_id = ?')
      .get(conversationId, userId) as { cnt: number }
    const isOwner = row.cnt > 0
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    await restoreConversation(conversationId)
    res.json({ message: 'Conversation restored' })
  } catch (error) {
    console.error('Error restoring conversation:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
