import { Router } from 'express'
import { createAuthWithUserMiddleware, createRoleGuard } from '../../middleware/auth'
import { upload } from '../../middleware/upload'
import {
  uploadDoc,
  deleteDoc,
  listDocs,
  getDoc,
  patchDoc,
  listGroups,
  createGroup,
  patchGroup,
  removeGroup
} from '../../controllers/admin.controller'
import { validateBody } from '../../middleware/validate'
import {
  SystemDocUploadRequest,
  SystemDocPatchRequest,
  SystemDocGroupRequest,
  SystemDocGroupPatchRequest
} from '../../dto/admin.dto'

const adminOnly = createRoleGuard(['admin'])
const auth = createAuthWithUserMiddleware
const requireAdmin = auth(adminOnly)
const router: Router = Router()

router.post(
  '/system-documents',
  requireAdmin,
  upload.single('file'),
  validateBody(SystemDocUploadRequest),
  uploadDoc
)
router.delete('/system-documents/:id', requireAdmin, deleteDoc)
router.get('/system-documents', requireAdmin, listDocs)
router.get('/system-documents/:id', requireAdmin, getDoc)
router.patch('/system-documents/:id', requireAdmin, validateBody(SystemDocPatchRequest), patchDoc)

router.get('/system-document-groups', requireAdmin, listGroups)
router.post(
  '/system-document-groups',
  requireAdmin,
  validateBody(SystemDocGroupRequest),
  createGroup
)
router.patch(
  '/system-document-groups/:id',
  requireAdmin,
  validateBody(SystemDocGroupPatchRequest),
  patchGroup
)
router.delete('/system-document-groups/:id', requireAdmin, removeGroup)

export default router
