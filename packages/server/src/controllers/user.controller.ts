import type { Request, RequestHandler, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { ValidationError } from '../lib/errors'
import {
  getProfile,
  updateProfile,
  bindPhone,
  changePassword,
  uploadAvatar
} from '../services/user.service'
import type { UpdateProfileRequest, BindPhoneRequest, ChangePasswordRequest } from '../dto/user.dto'

export const profile: RequestHandler = async (req: Request, res: Response) => {
  res.json(await getProfile((req as AuthRequest).auth!.userId))
}

export const update: RequestHandler = async (req: Request, res: Response) => {
  await updateProfile((req as AuthRequest).auth!.userId, req.body as UpdateProfileRequest)
  res.json({ message: 'Updated' })
}

export const phoneBind: RequestHandler = async (req: Request, res: Response) => {
  await bindPhone((req as AuthRequest).auth!.userId, (req.body as BindPhoneRequest).phone)
  res.json({ message: 'Phone bound' })
}

export const passwordChange: RequestHandler = async (req: Request, res: Response) => {
  const body = req.body as ChangePasswordRequest
  await changePassword((req as AuthRequest).auth!.userId, body.currentPassword, body.newPassword)
  res.json({ message: 'Password changed' })
}

export const avatar: RequestHandler = async (req: Request, res: Response) => {
  const file = req.file
  if (!file) throw new ValidationError('No file')
  const url = await uploadAvatar((req as AuthRequest).auth!.userId, file)
  res.json({ avatar: url })
}
