import ragRoute from './rag'
import authRoute from '../auth'
import captchaRouter from '../auth/captcha'
import userRoute from './user'
import conversationRoute from './conversation'
import adminRoute from './admin'
import type { Router } from 'express'

const routes: { name: string; path: string; handler: Router }[] = [
  { name: 'admin', path: 'admin', handler: adminRoute },
  { name: 'rag', path: 'rag', handler: ragRoute },
  { name: 'auth', path: 'auth', handler: authRoute },
  { name: 'captcha', path: 'captcha', handler: captchaRouter },
  { name: 'user', path: 'user', handler: userRoute },
  { name: 'conversations', path: 'conversations', handler: conversationRoute }
]

export default routes
