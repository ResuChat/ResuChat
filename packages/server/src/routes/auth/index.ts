import { Router } from 'express'
import {
  generateCaptcha,
  sendEmailVerificationCode,
  register,
  login,
  refresh,
  logout
} from '../../controllers/auth.controller'
import { validateBody } from '../../middleware/validate'
import {
  CaptchaGenerateRequest,
  SendEmailCodeRequest,
  RegisterRequest,
  LoginRequest,
  RefreshRequest,
  LogoutRequest
} from '../../dto/auth.dto'

const router: Router = Router()

router.post('/captcha/generate', validateBody(CaptchaGenerateRequest), generateCaptcha)
router.post('/send-email-code', validateBody(SendEmailCodeRequest), sendEmailVerificationCode)
router.post('/register', validateBody(RegisterRequest), register)
router.post('/login', validateBody(LoginRequest), login)
router.post('/refresh', validateBody(RefreshRequest), refresh)
router.post('/logout', validateBody(LogoutRequest), logout)

export default router
