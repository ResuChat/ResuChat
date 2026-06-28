import crypto from 'crypto'
import { isRedisReady, redis } from '../lib/redis'
import { EMAIL_CODE_TTL } from '../lib/config'
import { emailQueue } from '../lib/queue'
import { logger } from '../lib/logger'

const inMemoryCodes: Record<string, { email: string; code: string; expiresAt: number }> = {}

let _emailCleanupStarted = false
const emailCleanupInterval = (() => {
  if (_emailCleanupStarted) return null
  _emailCleanupStarted = true
  return setInterval(() => {
    const now = Date.now()
    for (const [key, e] of Object.entries(inMemoryCodes)) {
      if (e.expiresAt <= now) delete inMemoryCodes[key]
    }
  }, 60_000)
})()

export { emailCleanupInterval }

export async function sendEmailCode(email: string): Promise<string> {
  const code = crypto.randomInt(100000, 1000000).toString()
  const key = 'emailcode:' + crypto.randomUUID()
  if (redis && isRedisReady()) {
    await redis.setex(key, EMAIL_CODE_TTL, JSON.stringify({ email, code }))
  } else {
    inMemoryCodes[key] = { email, code, expiresAt: Date.now() + EMAIL_CODE_TTL * 1000 }
  }
  await emailQueue.add('send', {
    to: email,
    subject: '聊简历 - 邮箱验证码',
    text: `您的验证码是：${code}，5分钟内有效。`,
    html: `<p>您的验证码是：<strong>${code}</strong>，5分钟内有效。</p>`
  })
  logger.info('Email verification code queued', { email })
  return key
}

export async function verifyEmailCode(key: string, code: string): Promise<boolean> {
  let storedCode: string | null = null
  if (redis && isRedisReady()) {
    const raw = await redis.get(key)
    if (raw) {
      try {
        const p = JSON.parse(raw)
        storedCode = p.code
      } catch {
        storedCode = raw
      }
      await redis.del(key)
    }
  } else {
    const e = inMemoryCodes[key]
    if (e && e.expiresAt > Date.now()) {
      storedCode = e.code
      delete inMemoryCodes[key]
    } else if (e) {
      delete inMemoryCodes[key]
    }
  }
  return storedCode === code
}
