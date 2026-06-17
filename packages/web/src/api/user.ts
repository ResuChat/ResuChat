import { api } from './client'
import { getRefreshToken } from '@/lib/auth'
import type { UserNotificationRecord, UserNotificationsResponse, UserProfile } from '@/types/api'
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

export async function getUserNotifications(limit = 20): Promise<UserNotificationsResponse> {
  return api.get<UserNotificationsResponse, UserNotificationsResponse>('/user/notifications', {
    params: { limit }
  })
}

export async function markUserNotificationRead(
  id: number
): Promise<{ message: string; notification?: UserNotificationRecord }> {
  return api.patch(`/user/notifications/${id}/read`)
}

export async function markAllUserNotificationsRead(): Promise<{ message: string; count: number }> {
  return api.patch('/user/notifications/read-all')
}
