import { Router } from 'express'
import { createAuthWithUserMiddleware } from '../../middleware/auth'
import {
  listUserDocs,
  uploadUserDoc,
  renameUserDoc,
  deleteUserDoc,
  importToUserDocs,
  downloadUserDoc,
  retryParseUserDoc,
  cancelParseUserDoc
} from '../../controllers/user-documents.controller'
import { upload } from '../../middleware/upload'
import { validateBody, validateQuery } from '../../middleware/validate'
import {
  UserDocumentsQuery,
  RenameUserDocumentRequest,
  ImportUserDocumentRequest
} from '../../dto/documents.dto'
import { createUserDocumentOwnerGuard } from '../../services/document/user-documents.service'

const authenticate = createAuthWithUserMiddleware()
const userDocumentOwner = createAuthWithUserMiddleware(
  createUserDocumentOwnerGuard((req) => req.params.id)
)
const router: Router = Router()

router.get('/', authenticate, validateQuery(UserDocumentsQuery), listUserDocs)
router.get('/:id/download', userDocumentOwner, downloadUserDoc)
router.post('/', authenticate, upload.single('file'), uploadUserDoc)
router.post('/import', authenticate, validateBody(ImportUserDocumentRequest), importToUserDocs)
router.patch('/:id', userDocumentOwner, validateBody(RenameUserDocumentRequest), renameUserDoc)
router.post('/:id/retry-parse', userDocumentOwner, retryParseUserDoc)
router.post('/:id/cancel-parse', userDocumentOwner, cancelParseUserDoc)
router.delete('/:id', userDocumentOwner, deleteUserDoc)

export default router
