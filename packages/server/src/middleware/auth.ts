import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../services/auth.service'
import type { AuthGuard } from './authGuard'

export { createRoleGuard, createOwnerGuard } from './authGuard'

export interface AuthContext {
  userId: string
}

export interface AuthRequest extends Request {
  auth?: AuthContext
}

export function createAuthWithUserMiddleware(guard?: AuthGuard) {
  const mw = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req)
    if (!token) return res.status(401).json({ error: 'Token required' })
    const r = await verifyAccessToken(token)
    if (!r) return res.status(401).json({ error: 'Invalid or expired token' })
    req.auth = { userId: r.userId }

    if (guard) {
      const ok = await guard(req)
      if (!ok) return res.status(403).json({ error: 'Access denied' })
    }
    next()
  }

  return mw
}

function extractToken(req: Request): string | undefined {
  const auth = req.headers['authorization']
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7)
  const legacy = req.headers['token'] || req.headers['Token']
  return Array.isArray(legacy) ? legacy[0] : legacy
}
