import { createCanvas } from '@napi-rs/canvas'

/** 生成验证码图片 Buffer */
export function generateCaptchaImage(text: string): Buffer {
  try {
    const width = 150
    const height = 50
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#f8f8f8'
    ctx.fillRect(0, 0, width, height)

    // 干扰线
    for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) {
      ctx.beginPath()
      ctx.moveTo(Math.random() * width, Math.random() * height)
      ctx.lineTo(Math.random() * width, Math.random() * height)
      ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 180)}, ${Math.floor(Math.random() * 180)}, ${Math.floor(Math.random() * 180)}, 0.6)`
      ctx.lineWidth = 2 + Math.random() * 2
      ctx.stroke()
    }

    // 噪点
    const dotCount = 60 + Math.floor(Math.random() * 40)
    for (let i = 0; i < dotCount; i++) {
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, 0.7)`
      ctx.beginPath()
      ctx.arc(Math.random() * width, Math.random() * height, 1 + Math.random() * 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 字符
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
