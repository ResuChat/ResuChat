import { Router, Request, Response } from 'express'

import crypto from 'crypto'
import { redis } from '../lib/redis'
import { createCanvas } from '@napi-rs/canvas'

const inMemoryCaptcha: Record<string, { text: string; phone: string; expiresAt: number }> = {}

// 定时清理过期验证码（每分钟）
export const captchaCleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of Object.entries(inMemoryCaptcha)) {
    if (entry.expiresAt <= now) delete inMemoryCaptcha[key]
  }
}, 60_000)

function generateCaptchaImage(text: string): Buffer {
  try {
    const width = 150
    const height = 50
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    // 背景
    ctx.fillStyle = '#f8f8f8'
    ctx.fillRect(0, 0, width, height)

    // 干扰线（4-7 条）
    for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) {
      ctx.beginPath()
      ctx.moveTo(Math.random() * width, Math.random() * height)
      ctx.lineTo(Math.random() * width, Math.random() * height)
      ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 180)}, ${Math.floor(Math.random() * 180)}, ${Math.floor(Math.random() * 180)}, 0.6)`
      ctx.lineWidth = 2 + Math.random() * 2
      ctx.stroke()
    }

    // 噪点（60-100 个）
    const dotCount = 60 + Math.floor(Math.random() * 40)
    for (let i = 0; i < dotCount; i++) {
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, 0.7)`
      ctx.beginPath()
      ctx.arc(Math.random() * width, Math.random() * height, 1 + Math.random() * 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 字符（逐个绘制，随机位置+旋转）
    const chars = text.split('')
    const startX = width / 2 - (chars.length * 18) / 2
    ctx.textBaseline = 'middle'
    for (let i = 0; i < chars.length; i++) {
      ctx.save()
      const x = startX + i * 18 + Math.random() * 8 - 4
      const y = height / 2 + Math.random() * 10 - 5
      const angle = ((Math.random() * 60 - 30) * Math.PI) / 180
      ctx.translate(x, y)
      ctx.rotate(angle)
      const fontSize = 32 + Math.floor(Math.random() * 10)
      ctx.font = `bold ${fontSize}px monospace`
      ctx.fillStyle = `rgb(${Math.floor(Math.random() * 120)}, ${Math.floor(Math.random() * 120)}, ${Math.floor(Math.random() * 120)})`
      ctx.textAlign = 'center'
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
    }

    return canvas.toBuffer('image/png')
  } catch {
    return Buffer.from('placeholder captcha image')
  }
}

const captchaRouter: Router = Router()

captchaRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body

    if (!phone) {
      res.status(400).json({ error: 'Phone number required' })
      return
    }

    const text = Math.floor(100000 + Math.random() * 900000).toString()
    const key = 'captcha:' + crypto.randomUUID()

    if (redis && redis.status === 'ready') {
      await redis.setex(key, 300, JSON.stringify({ phone, text }))
    } else {
      inMemoryCaptcha[key] = { text, phone, expiresAt: Date.now() + 300000 }
    }

    const image = generateCaptchaImage(text)

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Captcha-Key', key)
    res.send(image)
  } catch (error) {
    console.error('Error generating captcha:', error)
    res.status(500).json({ error: 'Failed to generate captcha' })
  }
})

captchaRouter.post('/verify', async (req: Request, res: Response) => {
  try {
    const { key, code } = req.body

    if (!key || !code) {
      res.status(400).json({ error: 'Key and code required' })
      return
    }

    let storedText: string | null = null
    let phone: string | null = null

    if (redis && redis.status === 'ready') {
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

    if (storedText === code) {
      res.json({ valid: true })
    } else {
      res.json({ valid: false })
    }
  } catch (error) {
    console.error('Error verifying captcha:', error)
    res.status(500).json({ error: 'Failed to verify captcha' })
  }
})

export default captchaRouter
export { redis }
export { inMemoryCaptcha }
