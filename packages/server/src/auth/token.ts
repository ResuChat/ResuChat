import { redis as authRedis } from '../lib/redis'

import type { Request, Response, NextFunction } from 'express'

interface AuthRequest extends Request {
  username?: string
  userId?: number
}

if (authRedis) {
  authRedis.on('error', (err) => {
    console.error('Auth Redis connection error:', err)
  })
}

const inMemoryTokens: Record<string, { username: string; expires: number }> = {}

// 定时清理过期内存 token（每分钟）
export const tokenCleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [token, record] of Object.entries(inMemoryTokens)) {
    if (record.expires <= now) delete inMemoryTokens[token]
  }
}, 60_000)

export async function verifyToken(token: string): Promise<string | null> {
  if (!token) {
    return null
  }

  const record = inMemoryTokens[token]
  if (record && record.expires > Date.now()) {
    return record.username
  }

  if (authRedis && authRedis.status === 'ready') {
    try {
      const username = await authRedis.get(`token:${token}`)
      if (username) {
        inMemoryTokens[token] = {
          username,
          expires: Date.now() + 86400000
        }
        return username
      }
    } catch (e) {
      console.log('Redis get failed, using memory fallback')
      const fallback = inMemoryTokens[token]
      if (fallback && fallback.expires > Date.now()) return fallback.username
    }
  }

  return null
}

export function createAuthMiddleware() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization']
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined
    const legacyHeader = req.headers['token'] || req.headers['Token']
    const legacyToken = Array.isArray(legacyHeader) ? legacyHeader[0] : legacyHeader
    const token = bearerToken || legacyToken

    if (!token) {
      return res.status(401).json({ error: 'Token required' })
    }

    Promise.resolve(verifyToken(token))
      .then((username) => {
        if (!username) {
          return res.status(401).json({ error: 'Invalid or expired token' })
        }
        req.username = username
        next()
      })
      .catch(() => {
        return res.status(401).json({ error: 'Invalid or expired token' })
      })
  }
}

// 组合中间件：认证 + 解析 userId（用于 conversation/user 路由）
export function createAuthWithUserMiddleware() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization']
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined
    const legacyHeader = req.headers['token'] || req.headers['Token']
    const legacyToken = Array.isArray(legacyHeader) ? legacyHeader[0] : legacyHeader
    const token = bearerToken || legacyToken
    if (!token) return res.status(401).json({ error: 'Token required' })

    const username = await verifyToken(token)
    if (!username) return res.status(401).json({ error: 'Invalid or expired token' })

    const phone = username.replace(/^user_/, '')
    const { getUserIdByPhone } = await import('../storage/repository')
    const userId = await getUserIdByPhone(phone)
    if (!userId) return res.status(404).json({ error: 'User not found' })

    req.username = username
    req.userId = userId
    next()
  }
}

export async function storeToken(token: string, username: string, expirySeconds: number = 86400) {
  inMemoryTokens[token] = {
    username,
    expires: Date.now() + expirySeconds * 1000
  }
  if (authRedis && authRedis.status === 'ready') {
    await authRedis.setex(`token:${token}`, expirySeconds, username)
  }
}

export async function removeToken(token: string) {
  if (authRedis && authRedis.status === 'ready') {
    await authRedis.del(`token:${token}`)
  } else {
    delete inMemoryTokens[token]
  }
}

export { inMemoryTokens }
