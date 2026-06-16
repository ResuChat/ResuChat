import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { NotFoundError, ValidationError } from '../lib/errors'
import {
  countUsersByAvatar,
  getUserById,
  getUserAvatar,
  getUserIdByPhone,
  updateUserProfile,
  updateUserPhone,
  updateUserPassword
} from '../storage/user/users'
import { hashPassword, verifyPassword } from '../lib/password'
import type { UserRole } from '../types/domain'

export async function getUserRole(userId: string): Promise<UserRole | null> {
  const user = await getUserById(userId)
  return user?.role ?? null
}

export async function getProfile(userId: string) {
  const user = await getUserById(userId)
  if (!user) throw new NotFoundError('User not found')
  const { password, ...rest } = user
  return { ...rest, hasPassword: !!password }
}

export async function updateProfile(
  userId: string,
  data: { nickname?: string; avatar?: string | null }
) {
  await updateUserProfile(userId, data)
}

export async function bindPhone(userId: string, phone: string) {
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) throw new ValidationError('Invalid phone number')
  const existing = await getUserIdByPhone(phone)
  if (existing && existing !== userId) throw new ValidationError('Phone already in use')
  await updateUserPhone(userId, phone)
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (!newPassword || newPassword.length < 6)
    throw new ValidationError('Password must be at least 6 characters')
  const user = await getUserById(userId)
  if (user?.password) {
    if (!currentPassword) throw new ValidationError('Current password required')
    if (!(await verifyPassword(currentPassword, user.password)))
      throw new ValidationError('Current password is incorrect')
  }
  await updateUserPassword(userId, await hashPassword(newPassword))
}

export async function uploadAvatar(userId: string, file: { buffer: Buffer; originalname: string }) {
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex').slice(0, 16)
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'png'
  const avatarDir = path.join(process.cwd(), 'uploads', 'avatars')
  if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true })
  const filename = `avatar_${hash}.${ext}`
  const filepath = path.join(avatarDir, filename)
  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, file.buffer)

  const oldAvatar = await getUserAvatar(userId)
  if (oldAvatar) {
    const oldPath = oldAvatar.replace('/avatars/', '')
    const refCount = await countUsersByAvatar(oldAvatar)
    if (refCount <= 1) {
      const oldFile = path.join(avatarDir, oldPath)
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile)
    }
  }
  const avatarUrl = `/avatars/${filename}`
  await updateUserProfile(userId, { avatar: avatarUrl })
  return avatarUrl
}
