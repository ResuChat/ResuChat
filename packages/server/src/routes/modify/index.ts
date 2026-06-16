import { Router } from 'express'
import { createAuthWithUserMiddleware } from '../../middleware/auth'
import { upload } from '../../middleware/upload'
import { applyModification, renderPdf } from '../../controllers/modify.controller'
import { validateBody } from '../../middleware/validate'
import { ModifyRequest, RenderPdfRequest } from '../../dto/modify.dto'
import { createConversationOwnerGuard } from '../../services/document/conversation.service'

const authenticate = createAuthWithUserMiddleware()
const conversationOwner = createAuthWithUserMiddleware(
  createConversationOwnerGuard((req) => req.body.conversationId)
)
const router: Router = Router()

router.post(
  '/apply',
  upload.none(),
  validateBody(ModifyRequest),
  conversationOwner,
  applyModification
)
router.post('/render-pdf', upload.none(), validateBody(RenderPdfRequest), authenticate, renderPdf)

export default router
