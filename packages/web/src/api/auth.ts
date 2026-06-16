import { api } from './client'
import { saveAuth as persistAuth } from '@/lib/auth'
import type { LoginResponse, RegisterResponse } from '@/types/api'

export type LoginRequest =
  | {
      mode: 'phone'
      phone: string
      password: string
    }
  | {
      mode: 'password'
      email: string
      password: string
    }
  | {
      mode: 'email-code'
      email: string
      code: string
      key: string
    }

export interface RegisterRequest {
  email: string
  password: string
  emailCode: string
  emailKey: string
  captchaCode: string
  captchaKey: string
}

export async function sendEmailCode(email: string): Promise<{ key: string }> {
  return api.post<{ message: string; key: string }, { message: string; key: string }>(
    '/auth/send-email-code',
    { email }
  )
}

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  return api.post<RegisterResponse, RegisterResponse>('/auth/register', data)
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse, LoginResponse>('/auth/login', data)
}

export async function logoutWithRefreshToken(refreshToken: string): Promise<{ message: string }> {
  return api.post<{ message: string }, { message: string }>('/auth/logout', { refreshToken })
}

export function saveAuth(accessToken: string, refreshToken: string, phone?: string | null) {
  persistAuth(accessToken, refreshToken, phone)
}
