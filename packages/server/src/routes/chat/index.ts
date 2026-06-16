import { Router } from 'express'
import { createAuthWithUserMiddleware } from '../../middleware/auth'
import { upload } from '../../middleware/upload'
import { search, summarize } from '../../controllers/chat.controller'
import { validateBody } from '../../middleware/validate'
import { SearchRequest, SummarizeRequest } from '../../dto/chat.dto'
import { createConversationOwnerGuard } from '../../services/document/conversation.service'

const conversationOwner = createAuthWithUserMiddleware(
  createConversationOwnerGuard((req) => req.body.conversationId)
)
const router: Router = Router()

router.post(
  '/search',
  upload.array('files'),
  validateBody(SearchRequest),
  conversationOwner,
  search
)
router.post('/summarize', validateBody(SummarizeRequest), conversationOwner, summarize)

export default router
