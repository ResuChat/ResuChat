import { eq } from 'drizzle-orm'
import { db, schema } from '../lib/db'
import { NotFoundError, ValidationError } from '../lib/errors'
import { sendToUser, updateWsClientRole } from './ws-connections.service'
import { publishWsEvent, type RoutedWsEvent } from './ws-events.service'
import { createUserNotification } from '../storage/user/notifications'
import type { UserRole } from '../types/domain'

const allowedRoles = new Set<UserRole>(['normal', 'premium', 'admin'])

function roleLabel(role: UserRole): string {
  if (role === 'admin') return '管理员'
  if (role === 'premium') return '高级用户'
  return '普通用户'
}

async function publishOrDispatch(event: RoutedWsEvent): Promise<void> {
  const published = await publishWsEvent(event)
  if (published) return

  if (event.target === 'user') {
    sendToUser(event.userId, event.message)
    return
  }
  if (event.target === 'user_role') {
    updateWsClientRole(event.userId, event.role)
    sendToUser(event.userId, event.message)
  }
}

export async function updateUserRole(params: {
  userId: string
  role: UserRole
  operatorId?: string
}): Promise<{ id: string; phone: string | null; email: string | null; role: UserRole }> {
  if (!allowedRoles.has(params.role)) throw new ValidationError('Invalid user role')

  const now = Date.now()
  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: schema.users.id,
        phone: schema.users.phone,
        email: schema.users.email,
        role: schema.users.role
      })
      .from(schema.users)
      .where(eq(schema.users.id, params.userId))
      .limit(1)

    if (!user) throw new NotFoundError('User not found')
    const previousRole = user.role as UserRole

    if (previousRole === params.role) {
      return {
        user: { id: user.id, phone: user.phone, email: user.email, role: params.role },
        previousRole,
        notification: null
      }
    }

    await tx
      .update(schema.users)
      .set({ role: params.role, updatedAt: now })
      .where(eq(schema.users.id, params.userId))

    const notification = await createUserNotification(tx, {
      userId: params.userId,
      type: 'role_changed',
      title: '账号角色已更新',
      content: `您的账号角色已从${roleLabel(previousRole)}变更为${roleLabel(params.role)}。`,
      now
    })

    return {
      user: { id: user.id, phone: user.phone, email: user.email, role: params.role },
      previousRole,
      notification
    }
  })

  if (result.notification) {
    await publishOrDispatch({
      target: 'user_role',
      userId: result.user.id,
      role: params.role,
      message: {
        type: 'user_role_changed',
        payload: {
          role: params.role,
          previousRole: result.previousRole,
          operatorId: params.operatorId
        }
      }
    })
    await publishOrDispatch({
      target: 'user',
      userId: result.user.id,
      message: {
        type: 'notification_created',
        payload: { notification: result.notification }
      }
    })
  }

  return result.user
}
