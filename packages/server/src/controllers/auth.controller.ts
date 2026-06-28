import type { Request, Response } from 'express'
import { UnauthorizedError } from '../lib/errors'
import {
  createCaptcha,
  rotateRefreshToken,
  removeRefreshToken,
  registerWithEmail,
  loginUser
} from '../services/auth.service'
import { sendEmailCode } from '../services/email.service'

export async function generateCaptcha(req: Request, res: Response) {
  const { phone } = req.body
  const { key, image } = await createCaptcha(phone)
  res.setHeader('Content-Type', 'image/png').setHeader('Captcha-Key', key)
  res.send(image)
}

export async function sendEmailVerificationCode(req: Request, res: Response) {
  const { email } = req.body
  const key = await sendEmailCode(email)
  res.json({ message: 'Verification code sent', data: { key } })
}

export async function register(req: Request, res: Response) {
  const { email, password, emailCode, emailKey, captchaCode, captchaKey } = req.body
  const result = await registerWithEmail({
    email,
    password,
    emailCode,
    emailKey,
    captchaCode,
    captchaKey,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] as string
  })
  res.json({ message: 'Registration successful', data: result })
}

export async function login(req: Request, res: Response) {
  const result = await loginUser({
    ...req.body,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] as string
  })
  res.json({ message: 'Login successful', data: result })
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body
  const result = await rotateRefreshToken(refreshToken)
  if (!result) {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }
  res.json(result)
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body
  await removeRefreshToken(refreshToken)
  res.json({ message: 'Logged out' })
}
