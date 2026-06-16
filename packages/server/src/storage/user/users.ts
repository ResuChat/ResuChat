import crypto from 'crypto'
import { count, eq } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import type { User, UserRole } from '../../types/domain'

export type { User } from '../../types/domain'

function mapUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    password: row.password,
    nickname: row.nickname,
    role: row.role as UserRole,
    avatar: row.avatar ?? undefined,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  } as User
}

// ── Phone-based (保持向后兼容) ──

export async function ensureUser(phone: string): Promise<string> {
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.phone, phone))
    .limit(1)
  if (existing) return existing.id

  const now = Date.now()
  const nickname = `user_${phone}`
  const [created] = await db
    .insert(schema.users)
    .values({ phone, nickname, email: null, password: null, createdAt: now, updatedAt: now })
    .returning({ id: schema.users.id })
  return created.id
}

export async function getUserIdByPhone(phone: string): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.phone, phone))
    .limit(1)
  return row ? row.id : null
}

export async function getUserAvatar(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ avatar: schema.users.avatar })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return row?.avatar ?? null
}

export async function countUsersByAvatar(avatar: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.users)
    .where(eq(schema.users.avatar, avatar))
  return row?.value ?? 0
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1)
  return row ? mapUser(row) : null
}

// ── Email-based ──

export async function getUserByEmail(email: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  return row ? mapUser(row) : null
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)
  return row ? row.id : null
}

export async function createUserWithEmail(email: string, passwordHash: string): Promise<string> {
  const now = Date.now()
  const nickname = email.split('@')[0]
  const [created] = await db
    .insert(schema.users)
    .values({ email, password: passwordHash, nickname, createdAt: now, updatedAt: now })
    .returning({ id: schema.users.id })
  return created.id
}

// ── Common ──

export async function getUserById(userId: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return row ? mapUser(row) : null
}

export async function recordLogin(
  userId: string,
  token: string,
  ip?: string | null,
  userAgent?: string
) {
  const now = Date.now()
  const hashed = crypto.createHash('sha256').update(token).digest('hex')
  await db.insert(schema.loginHistory).values({
    userId,
    token: hashed,
    ip: ip || null,
    userAgent: userAgent || null,
    loginAt: now
  })
  await db.update(schema.users).set({ updatedAt: now }).where(eq(schema.users.id, userId))
}

export async function updateUserProfile(
  userId: string,
  data: { nickname?: string; avatar?: string | null; phone?: string }
): Promise<void> {
  await db
    .update(schema.users)
    .set({
      ...(data.nickname !== undefined ? { nickname: data.nickname } : {}),
      ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      updatedAt: Date.now()
    })
    .where(eq(schema.users.id, userId))
}

export async function updateUserPhone(userId: string, phone: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ phone, updatedAt: Date.now() })
    .where(eq(schema.users.id, userId))
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ password: passwordHash, updatedAt: Date.now() })
    .where(eq(schema.users.id, userId))
}
