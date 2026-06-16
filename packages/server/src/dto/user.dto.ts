import { z } from 'zod'

/** 用户信息响应 */
export const UserProfileResponse = z.object({
  id: z.number(),
  phone: z.string(),
  nickname: z.string(),
  created_at: z.number(),
  updated_at: z.number()
})

export type UserProfileResponse = z.infer<typeof UserProfileResponse>

/** 用户信息（脱敏后） */
export const UserProfilePublic = UserProfileResponse.omit({ phone: true }).extend({
  phone: z.string() // 脱敏后的手机号
})

export type UserProfilePublic = z.infer<typeof UserProfilePublic>

export const UpdateProfileRequest = z.object({
  nickname: z.string().trim().min(1).max(50).optional(),
  avatar: z.string().trim().min(1).nullable().optional()
})

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>

export const BindPhoneRequest = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
})

export type BindPhoneRequest = z.infer<typeof BindPhoneRequest>

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().optional().default(''),
  newPassword: z.string().min(6, '密码至少 6 位')
})

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>
