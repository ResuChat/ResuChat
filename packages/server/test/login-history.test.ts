import { describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { db, schema } from '../src/lib/db'
import { LOGIN_HISTORY_RETENTION_MS } from '../src/lib/config'
import { deleteLoginHistoryBefore } from '../src/storage/user/users'
import { getApiTestState, registerApiTestLifecycle } from './helpers/api-test-helper'

registerApiTestLifecycle()

describe('login history cleanup', () => {
  it('deletes only login history rows older than retention cutoff', async () => {
    const userId = getApiTestState().testUserId
    const now = Date.now()
    const cutoff = now - LOGIN_HISTORY_RETENTION_MS
    const oldToken = `old-login-history-${now}`
    const boundaryToken = `boundary-login-history-${now}`
    const recentToken = `recent-login-history-${now}`
    const tokens = [oldToken, boundaryToken, recentToken]

    await db.insert(schema.loginHistory).values([
      {
        userId,
        token: oldToken,
        ip: null,
        userAgent: null,
        loginAt: cutoff - 1
      },
      {
        userId,
        token: boundaryToken,
        ip: null,
        userAgent: null,
        loginAt: cutoff
      },
      {
        userId,
        token: recentToken,
        ip: null,
        userAgent: null,
        loginAt: now
      }
    ])

    try {
      const deleted = await deleteLoginHistoryBefore(cutoff)
      expect(deleted).toBe(1)

      const remaining = await db
        .select({ token: schema.loginHistory.token })
        .from(schema.loginHistory)
        .where(inArray(schema.loginHistory.token, tokens))

      expect(remaining.map((row) => row.token).sort()).toEqual([boundaryToken, recentToken].sort())
    } finally {
      await db.delete(schema.loginHistory).where(inArray(schema.loginHistory.token, tokens))
    }
  })
})
