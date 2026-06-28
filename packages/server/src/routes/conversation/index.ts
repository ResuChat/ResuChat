import { Router } from 'express'
import { createAuthWithUserMiddleware } from '../../middleware/auth'
import { upload } from '../../middleware/upload'
import {
  listConversations,
  listDeletedConversations,
  getMessages,
  deleteConv,
  restoreConv,
  getProgress,
  start
} from '../../controllers/conversation.controller'
import {
  createConversationOwnerGuard,
  createConversationParticipantGuard
} from '../../services/document/conversation.service'
import { validateBody, validateParams, validateQuery } from '../../middleware/validate'
import { MessagesQuery, StartConversationRequest } from '../../dto/conversation.dto'
import { ConversationIdParam } from '../../dto/common.dto'

const authenticate = createAuthWithUserMiddleware()
const owner = createAuthWithUserMiddleware(createConversationOwnerGuard((req) => req.params.id))
const participant = createAuthWithUserMiddleware(
  createConversationParticipantGuard((req) => req.params.id)
)
const router: Router = Router()

router.get('/', authenticate, listConversations)
router.get('/deleted', authenticate, listDeletedConversations)
router.get('/start/progress/:convId', authenticate, getProgress)
router.post(
  '/start',
  upload.array('files'),
  validateBody(StartConversationRequest),
  authenticate,
  start
)
router.post('/start-from-doc', validateBody(StartConversationRequest), authenticate, start)
router.get(
  '/:id/messages',
  validateParams(ConversationIdParam),
  owner,
  validateQuery(MessagesQuery),
  getMessages
)
router.delete('/:id', owner, deleteConv)
router.post('/:id/restore', participant, restoreConv)

export default router
