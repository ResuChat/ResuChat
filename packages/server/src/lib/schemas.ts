import { z } from 'zod'

export const TodoSchema = z.object({
  title: z.string(),
  completed: z.boolean()
})

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().min(0).max(150).optional(),
  role: z.enum(['admin', 'user', 'guest'])
})

export const MessageSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(1000),
  senderId: z.string().uuid(),
  receiverId: z.string().uuid(),
  timestamp: z.string().datetime()
})
