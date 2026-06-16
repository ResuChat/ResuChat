import { api } from './client'
import { getRefreshToken } from '@/lib/auth'
import type { UserProfile } from '@/types/api'
import { logoutWithRefreshToken } from './auth'

export async function getUserProfile(): Promise<UserProfile> {
  return api.get<UserProfile, UserProfile>('/user/profile')
}

export async function logout(): Promise<{ message: string } | void> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return
  return logoutWithRefreshToken(refreshToken)
}

export async function bindPhone(phone: string): Promise<{ message: string }> {
  return api.patch<{ message: string }, { message: string }>('/user/bind-phone', { phone })
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return api.patch<{ message: string }, { message: string }>('/user/change-password', {
    currentPassword,
    newPassword
  })
}
