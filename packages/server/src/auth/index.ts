import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { redis, inMemoryCaptcha } from './captcha'
import { storeToken, verifyToken, removeToken } from './token'
import { ensureUser, recordLogin } from '../storage/repository'

const router: Router = Router()

router.post('/login', async (req: Request, res: Response) => {
  const { phone, captcha, key } = req.body

  if (!phone || !captcha || !key) {
    res.status(400).json({ error: 'Phone, captcha and key are required' })
    return
  }

  let storedCaptcha: string | null = null

  if (redis && redis.status === 'ready') {
    storedCaptcha = await redis.get(key)
    if (storedCaptcha) {
      await redis.del(key)
    }
  } else {
    const captchaData = inMemoryCaptcha[key]
    if (captchaData && captchaData.expiresAt > Date.now()) {
      storedCaptcha = captchaData.text
      delete inMemoryCaptcha[key]
    } else if (captchaData) {
      delete inMemoryCaptcha[key]
    }
  }

  if (!storedCaptcha) {
    res.status(400).json({ error: 'Invalid or expired captcha key' })
    return
  }

  if (storedCaptcha !== captcha) {
    res.status(400).json({ error: 'Invalid captcha' })
    return
  }

  const username = `user_${phone}`
  const token = crypto.randomUUID()
  await storeToken(token, username, 86400)

  const userId = await ensureUser(phone)
  const ip = req.ip || req.socket.remoteAddress
  const userAgent = req.headers['user-agent'] as string
  await recordLogin(userId, token, ip, userAgent)

  res.json({ message: 'Login successful', token, username })
})

router.post('/logout', async (req: Request, res: Response) => {
  const token = (req.headers['token'] as string) || (req.headers['Token'] as string)

  if (token) {
    await removeToken(token)
  }

  res.json({ message: 'Logged out' })
})

export default router
export { verifyToken }
