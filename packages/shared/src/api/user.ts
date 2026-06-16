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
