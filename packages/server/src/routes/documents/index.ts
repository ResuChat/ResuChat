import { Router } from 'express'
import { createAuthWithUserMiddleware } from '../../middleware/auth'
import {
  listDocs,
  docHistory,
  removeDoc,
  restoreDoc,
  downloadDoc
} from '../../controllers/documents.controller'
import { validateQuery } from '../../middleware/validate'
import { createConversationOwnerGuard } from '../../services/document/conversation.service'
import { createConversationDocumentOwnerGuard } from '../../services/document/documents.service'
import { DocsQuery, DeleteDocQuery } from '../../dto/documents.dto'

const conversationOwnerFromParam = createAuthWithUserMiddleware(
  createConversationOwnerGuard((req) => req.params.conversationId)
)
const conversationOwnerFromQuery = createAuthWithUserMiddleware(
  createConversationOwnerGuard((req) =>
    typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined
  )
)
const documentOwner = createAuthWithUserMiddleware(
  createConversationDocumentOwnerGuard((req) => req.params.refId)
)
const router: Router = Router()

router.get('/', validateQuery(DocsQuery), conversationOwnerFromQuery, listDocs)
router.get('/:conversationId/history', conversationOwnerFromParam, docHistory)
router.delete('/:refId', validateQuery(DeleteDocQuery), documentOwner, removeDoc)
router.post('/:refId/restore', documentOwner, restoreDoc)
router.get('/:refId/download', documentOwner, downloadDoc)

export default router
