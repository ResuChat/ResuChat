import { z } from 'zod'

export const CaptchaGenerateRequest = z.object({
  phone: z.string().min(1)
})
export type CaptchaGenerateRequest = z.infer<typeof CaptchaGenerateRequest>

export const SendEmailCodeRequest = z.object({
  email: z.string().email()
})
export type SendEmailCodeRequest = z.infer<typeof SendEmailCodeRequest>

export const RegisterRequest = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  emailCode: z.string().min(1),
  emailKey: z.string().min(1),
  captchaCode: z.string().min(1),
  captchaKey: z.string().min(1)
})
export type RegisterRequest = z.infer<typeof RegisterRequest>

const PhoneLoginRequest = z.object({
  mode: z.literal('phone'),
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  password: z.string().min(1)
})

const PasswordLoginRequest = z.object({
  mode: z.literal('password'),
  email: z.string().email(),
  password: z.string().min(1)
})

const EmailCodeLoginRequest = z.object({
  mode: z.literal('email-code'),
  email: z.string().email(),
  code: z.string().min(1),
  key: z.string().min(1)
})

export const LoginRequest = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const input = value as Record<string, unknown>
    return input.mode ? input : { ...input, mode: 'phone' }
  },
  z.discriminatedUnion('mode', [PhoneLoginRequest, PasswordLoginRequest, EmailCodeLoginRequest])
)
export type LoginRequest = z.infer<typeof LoginRequest>

export const RefreshRequest = z.object({
  refreshToken: z.string().min(1)
})
export type RefreshRequest = z.infer<typeof RefreshRequest>

export const LogoutRequest = z.object({
  refreshToken: z.string().min(1)
})
export type LogoutRequest = z.infer<typeof LogoutRequest>
