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
import { validateBody } from '../../middleware/validate'
import { StartConversationRequest } from '../../dto/conversation.dto'

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
router.get('/:id/messages', owner, getMessages)
router.delete('/:id', owner, deleteConv)
router.post('/:id/restore', participant, restoreConv)

export default router
