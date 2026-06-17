import type { UserRole } from '../domain/user'

export interface UserProfile {
  id: string
  phone: string | null
  email: string | null
  nickname: string
  avatar: string | null
  role: UserRole
  createdAt: number
  updatedAt: number
  hasPassword: boolean
}

export interface UserNotificationRecord {
  id: number
  type: string
  title: string
  content: string
  readAt: number | null
  createdAt: number
}

export interface UserNotificationsResponse {
  data: UserNotificationRecord[]
  unreadCount: number
}
