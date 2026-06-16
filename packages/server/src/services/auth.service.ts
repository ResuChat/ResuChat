import jwt from 'jsonwebtoken'
import type { JwtPayload } from 'jsonwebtoken'
import crypto from 'crypto'
import { redis, isRedisReady, onRedisReady } from '../lib/redis'
import { JWT_SECRET, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY } from '../lib/config'
import { sendToUser, hasActiveConnection } from './ws-connections.service'
import { logger } from '../lib/logger'
import { ConflictError, ValidationError } from '../lib/errors'
import { hashPassword, verifyPassword } from '../lib/password'
import { verifyEmailCode } from './email.service'
import { createCaptcha, verifyAndConsumeCaptcha, checkCaptcha } from './captcha.service'
import {
  createUserWithEmail,
  getUserByEmail,
  getUserByPhone,
  recordLogin
} from '../storage/user/users'
import type { User } from '../types/domain'

type AccessTokenPayload = JwtPayload & {
  userId: string
  username?: string
  sv: number
}

type RefreshTokenPayload = JwtPayload & {
  jti: string
  userId: string
  type: 'refresh'
}

function isObjectPayload(payload: string | JwtPayload): payload is JwtPayload {
  return typeof payload === 'object' && payload !== null
}

function isAccessTokenPayload(payload: string | JwtPayload): payload is AccessTokenPayload {
  return (
    isObjectPayload(payload) &&
    typeof payload.userId === 'string' &&
    typeof payload.sv === 'number' &&
    (payload.username === undefined || typeof payload.username === 'string')
  )
}

function isRefreshTokenPayload(payload: string | JwtPayload): payload is RefreshTokenPayload {
  return (
    isObjectPayload(payload) &&
    typeof payload.jti === 'string' &&
    typeof payload.userId === 'string' &&
    payload.type === 'refresh'
  )
}

// 内存降级存储（仅在 Redis 不可用时使用）
export const inMemoryRefresh: Record<string, { userId: string; expires: number }> = {}
const inMemorySessions: Record<string, number> = {}

function useRedis(): boolean {
  return !!(redis && isRedisReady())
}

let _cleanupStarted = false
export const tokenCleanupInterval = (() => {
  if (_cleanupStarted) return null as unknown as ReturnType<typeof setInterval>
  _cleanupStarted = true
  return setInterval(() => {
    const now = Date.now()
    for (const [jti, r] of Object.entries(inMemoryRefresh)) {
      if (r.expires <= now) delete inMemoryRefresh[jti]
    }
  }, 60_000)
})()

export { createCaptcha, verifyAndConsumeCaptcha, checkCaptcha }
export { hashPassword, verifyPassword }

// ===== Redis 重连同步 =====

onRedisReady(async () => {
  logger.info('Auth in-memory state sync started')
  let sessionCount = 0
  let refreshCount = 0

  for (const [userId, sv] of Object.entries(inMemorySessions)) {
    try {
      const redisSv = await redis!.get(`user:${userId}:sv`)
      const target = redisSv ? Math.max(parseInt(redisSv), sv) : sv
      await redis!.set(`user:${userId}:sv`, target, 'EX', JWT_REFRESH_EXPIRY)
      sessionCount++
    } catch {
      /* 单条失败跳过 */
    }
  }
  for (const [jti, r] of Object.entries(inMemoryRefresh)) {
    if (r.expires <= Date.now()) continue
    try {
      const exists = await redis!.get(`refresh:${jti}`)
      if (!exists) {
        const ttl = Math.max(1, Math.ceil((r.expires - Date.now()) / 1000))
        await redis!.setex(`refresh:${jti}`, ttl, r.userId)
        await redis!.setex(`user:${r.userId}:jti`, ttl, jti)
        refreshCount++
      }
    } catch {
      /* 单条失败跳过 */
    }
  }

  // 清空内存
  for (const k of Object.keys(inMemorySessions)) delete inMemorySessions[k]
  for (const k of Object.keys(inMemoryRefresh)) delete inMemoryRefresh[k]

  logger.info('Auth in-memory state synced', { sessionCount, refreshCount })
})

// ===== Session Version =====

async function incrSessionVersion(userId: string): Promise<number> {
  if (useRedis()) {
    const sv = await redis!.incr(`user:${userId}:sv`)
    await redis!.expire(`user:${userId}:sv`, JWT_REFRESH_EXPIRY)
    return sv
  }
  const sv = (inMemorySessions[userId] || 0) + 1
  inMemorySessions[userId] = sv
  return sv
}

/**
 * 获取 session version。
 * Redis 不可达且内存无记录时返回 'bypass'，调用方跳过 sv 比对。
 */
async function getSessionVersion(userId: string): Promise<number | 'bypass'> {
  if (useRedis()) {
    const r = await redis!.get(`user:${userId}:sv`)
    return r ? parseInt(r) : 0
  }
  if (userId in inMemorySessions) return inMemorySessions[userId]
  return 'bypass'
}

// ===== Token =====

export async function signTokens(userId: string, username: string) {
  if (hasActiveConnection(userId)) {
    sendToUser(userId, { type: 'remote_login', payload: { message: '账号在其他设备登录' } })
  }

  // 删除旧 refresh（Redis + 内存都清，确保不漏）
  if (useRedis()) {
    const oldJti = await redis!.get(`user:${userId}:jti`)
    if (oldJti) await redis!.del(`refresh:${oldJti}`)
  }
  for (const [oj, r] of Object.entries(inMemoryRefresh)) {
    if (r.userId === userId) delete inMemoryRefresh[oj]
  }

  const jti = crypto.randomUUID()
  const sv = await incrSessionVersion(userId)
  const accessToken = jwt.sign({ userId, username, sv }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY
  })
  const refreshToken = jwt.sign({ jti, userId, type: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY
  })

  if (useRedis()) {
    await redis!.setex(`refresh:${jti}`, JWT_REFRESH_EXPIRY, String(userId))
    await redis!.setex(`user:${userId}:jti`, JWT_REFRESH_EXPIRY, jti)
  } else {
    inMemoryRefresh[jti] = { userId, expires: Date.now() + JWT_REFRESH_EXPIRY * 1000 }
  }

  return { accessToken, refreshToken }
}

export async function registerWithEmail(params: {
  email: string
  password: string
  emailCode: string
  emailKey: string
  captchaCode: string
  captchaKey: string
  ip?: string
  userAgent?: string
}) {
  if (!(await checkCaptcha(params.captchaKey, params.captchaCode))) {
    throw new ValidationError('Invalid captcha')
  }
  if (!(await verifyEmailCode(params.emailKey, params.emailCode))) {
    throw new ValidationError('Invalid email code')
  }
  if (await getUserByEmail(params.email)) {
    throw new ConflictError('Email already registered')
  }

  const userId = await createUserWithEmail(params.email, await hashPassword(params.password))
  const tokens = await signTokens(userId, params.email)
  await recordLogin(userId, tokens.refreshToken, params.ip, params.userAgent)
  return { ...tokens, userId }
}

export async function loginUser(params: {
  mode: string
  phone?: string
  email?: string
  password?: string
  code?: string
  key?: string
  ip?: string
  userAgent?: string
}) {
  let userId: string
  let displayName: string

  if (params.mode === 'phone') {
    const user = (await getUserByPhone(params.phone || '')) as User | null
    if (!user) {
      throw new ValidationError('User not found')
    }
    if (!user.password || !(await verifyPassword(params.password || '', user.password))) {
      throw new ValidationError('Invalid password')
    }
    userId = user.id
    displayName = user.phone || params.phone || ''
  } else if (params.mode === 'password') {
    const user = await getUserByEmail(params.email || '')
    if (!user || !user.password || !(await verifyPassword(params.password || '', user.password))) {
      throw new ValidationError('Invalid email or password')
    }
    userId = user.id
    displayName = user.email || params.email || ''
  } else if (params.mode === 'email-code') {
    if (!(await verifyEmailCode(params.key || '', params.code || ''))) {
      throw new ValidationError('Invalid verification code')
    }
    const email = params.email || ''
    const user = await getUserByEmail(email)
    userId = user ? user.id : await createUserWithEmail(email, '')
    displayName = email
  } else {
    throw new ValidationError('Invalid login mode')
  }

  const tokens = await signTokens(userId, displayName)
  await recordLogin(userId, tokens.refreshToken, params.ip, params.userAgent)
  return { ...tokens, userId, username: displayName }
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string; username: string } | null> {
  if (!token) return null
  let payload: string | JwtPayload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
  if (!isAccessTokenPayload(payload)) return null
  const sv = await getSessionVersion(payload.userId)
  if (sv === 'bypass') {
    return { userId: payload.userId, username: payload.username ?? '' } // Redis 不可达，只靠 JWT 过期时间
  }
  if (payload.sv !== sv) return null
  return { userId: payload.userId, username: payload.username ?? '' }
}

export async function verifyRefreshToken(
  token: string
): Promise<{ jti: string; userId: string } | null> {
  if (!token) return null
  let payload: string | JwtPayload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
  if (!isRefreshTokenPayload(payload)) return null
  if (useRedis()) {
    return (await redis!.get(`refresh:${payload.jti}`))
      ? { jti: payload.jti, userId: payload.userId }
      : null
  }
  const r = inMemoryRefresh[payload.jti]
  if (!r || r.expires <= Date.now()) return null
  return { jti: payload.jti, userId: payload.userId }
}

export async function rotateRefreshToken(oldToken: string) {
  const p = await verifyRefreshToken(oldToken)
  if (!p) return null
  await removeRefreshTokenByJti(p.jti, p.userId)
  const sv = await getSessionVersion(p.userId)
  const newJti = crypto.randomUUID()
  const accessToken = jwt.sign({ userId: p.userId, sv: sv === 'bypass' ? 0 : sv }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY
  })
  const refreshToken = jwt.sign({ jti: newJti, userId: p.userId, type: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY
  })

  if (useRedis()) {
    await redis!.setex(`refresh:${newJti}`, JWT_REFRESH_EXPIRY, String(p.userId))
    await redis!.setex(`user:${p.userId}:jti`, JWT_REFRESH_EXPIRY, newJti)
  } else {
    inMemoryRefresh[newJti] = { userId: p.userId, expires: Date.now() + JWT_REFRESH_EXPIRY * 1000 }
  }

  return { accessToken, refreshToken }
}

async function removeRefreshTokenByJti(jti: string, userId?: string) {
  delete inMemoryRefresh[jti]
  if (useRedis()) {
    await redis!.del(`refresh:${jti}`)
    if (userId) await redis!.del(`user:${userId}:jti`)
  }
}

export async function removeRefreshToken(token: string) {
  try {
    const p = jwt.decode(token)
    if (p && typeof p === 'object' && typeof p.jti === 'string') {
      await removeRefreshTokenByJti(p.jti)
    }
  } catch {
    /* jwt.decode can fail if token is malformed */
  }
}
