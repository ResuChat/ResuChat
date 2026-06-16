import crypto from 'crypto'
import { redis } from '../lib/redis'
import { CAPTCHA_TTL } from '../lib/config'
import { generateCaptchaImage } from '../lib/captcha'

// ===== 验证码存储 =====

interface CaptchaEntry {
  text: string
  phone: string
  expiresAt: number
}

const inMemoryCaptcha: Record<string, CaptchaEntry> = {}

let _captchaCleanupStarted = false
export const captchaCleanupInterval = (() => {
  if (_captchaCleanupStarted) return null as unknown as ReturnType<typeof setInterval>
  _captchaCleanupStarted = true
  return setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of Object.entries(inMemoryCaptcha)) {
      if (entry.expiresAt <= now) delete inMemoryCaptcha[key]
    }
  }, 60_000)
})()

/** 生成验证码，存储到内存/Redis，返回 { key, imageBuffer } */
export async function createCaptcha(phone: string): Promise<{ key: string; image: Buffer }> {
  const text = crypto.randomInt(100000, 1000000).toString()
  const key = 'captcha:' + crypto.randomUUID()

  if (redis) {
    await redis.setex(key, CAPTCHA_TTL, JSON.stringify({ phone, text }))
  } else {
    inMemoryCaptcha[key] = { text, phone, expiresAt: Date.now() + CAPTCHA_TTL * 1000 }
  }

  return { key, image: generateCaptchaImage(text) }
}

/**
 * 验证并消费验证码
 * @param key        验证码 key
 * @param expectedCode 可选。若提供则比对验证码；不提供则仅消费并返回 phone
 * @returns 验证通过返回 phone，失败返回 null
 */
export async function verifyAndConsumeCaptcha(
  key: string,
  expectedCode?: string
): Promise<string | null> {
  let storedText: string | null = null
  let phone: string | null = null

  if (redis) {
    const raw = await redis.get(key)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        storedText = parsed.text
        phone = parsed.phone
      } catch {
        storedText = raw
      }
      await redis.del(key)
    }
  } else {
    const captcha = inMemoryCaptcha[key]
    if (captcha && captcha.expiresAt > Date.now()) {
      storedText = captcha.text
      phone = captcha.phone
      delete inMemoryCaptcha[key]
    } else if (captcha) {
      delete inMemoryCaptcha[key]
    }
  }

  if (!storedText) return null
  return expectedCode !== undefined ? (storedText === expectedCode ? phone : null) : phone
}

/** 验证验证码是否正确（不消费），用于 /captcha/verify 独立端点 */
export async function checkCaptcha(key: string, code: string): Promise<boolean> {
  return (await verifyAndConsumeCaptcha(key, code)) !== null
}
