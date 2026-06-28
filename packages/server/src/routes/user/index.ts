import { Router } from 'express'
import { createAuthWithUserMiddleware } from '../../middleware/auth'
import { upload } from '../../middleware/upload'
import { validateBody } from '../../middleware/validate'
import { validateQuery } from '../../middleware/validate'
import {
  UpdateProfileRequest,
  BindPhoneRequest,
  ChangePasswordRequest,
  NotificationsQuery
} from '../../dto/user.dto'
import {
  profile,
  update,
  phoneBind,
  passwordChange,
  avatar,
  notifications,
  notificationRead,
  notificationsReadAll
} from '../../controllers/user.controller'

const authenticate = createAuthWithUserMiddleware()
const router: Router = Router()

router.get('/profile', authenticate, profile)
router.patch('/profile', authenticate, validateBody(UpdateProfileRequest), update)
router.patch('/bind-phone', authenticate, validateBody(BindPhoneRequest), phoneBind)
router.patch('/change-password', authenticate, validateBody(ChangePasswordRequest), passwordChange)
router.post('/avatar', authenticate, upload.single('file'), avatar)
router.get('/notifications', authenticate, validateQuery(NotificationsQuery), notifications)
router.patch('/notifications/:id/read', authenticate, notificationRead)
router.patch('/notifications/read-all', authenticate, notificationsReadAll)

export default router
