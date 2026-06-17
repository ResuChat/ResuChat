import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import type { UserNotificationRecord } from '@resuchat/shared'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

type NotificationInput = {
  userId: string
  type: string
  title: string
  content: string
  now?: number
}

function mapNotification(
  row: typeof schema.userNotifications.$inferSelect
): UserNotificationRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    readAt: row.readAt,
    createdAt: row.createdAt
  }
}

export async function createUserNotification(
  tx: DbTransaction,
  input: NotificationInput
): Promise<UserNotificationRecord> {
  const [created] = await tx
    .insert(schema.userNotifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      content: input.content,
      createdAt: input.now ?? Date.now()
    })
    .returning()
  return mapNotification(created)
}

export async function listUserNotifications(
  userId: string,
  limit = 20
): Promise<{ data: UserNotificationRecord[]; unreadCount: number }> {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20
  const [rows, unreadRows] = await Promise.all([
    db
      .select()
      .from(schema.userNotifications)
      .where(eq(schema.userNotifications.userId, userId))
      .orderBy(desc(schema.userNotifications.createdAt), desc(schema.userNotifications.id))
      .limit(normalizedLimit),
    db
      .select({ value: count() })
      .from(schema.userNotifications)
      .where(
        and(eq(schema.userNotifications.userId, userId), isNull(schema.userNotifications.readAt))
      )
  ])

  return {
    data: rows.map(mapNotification),
    unreadCount: unreadRows[0]?.value ?? 0
  }
}

export async function markUserNotificationRead(userId: string, id: number): Promise<boolean> {
  const updated = await db
    .update(schema.userNotifications)
    .set({ readAt: Date.now() })
    .where(and(eq(schema.userNotifications.userId, userId), eq(schema.userNotifications.id, id)))
    .returning({ id: schema.userNotifications.id })
  return updated.length > 0
}

export async function markAllUserNotificationsRead(userId: string): Promise<number> {
  const updated = await db
    .update(schema.userNotifications)
    .set({ readAt: Date.now() })
    .where(
      and(eq(schema.userNotifications.userId, userId), isNull(schema.userNotifications.readAt))
    )
    .returning({ id: schema.userNotifications.id })
  return updated.length
}
