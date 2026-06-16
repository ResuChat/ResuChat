import { beforeEach, describe, expect, it } from 'vitest'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-key'

const authModule = await import('../src/services/auth.service')
const { signTokens, verifyAccessToken, rotateRefreshToken, inMemoryRefresh } = authModule

describe('auth token helpers', () => {
  beforeEach(() => {
    for (const key of Object.keys(inMemoryRefresh)) {
      delete inMemoryRefresh[key]
    }
  })

  it('verifyAccessToken should return null for empty token', async () => {
    const result = await verifyAccessToken('')
    expect(result).toBeNull()
  })

  it('verifyAccessToken should return null for malformed token', async () => {
    const result = await verifyAccessToken('not-a-token')
    expect(result).toBeNull()
  })

  it('verifyAccessToken should decode a signed access token', async () => {
    const tokens = await signTokens('user-1', 'tester')
    const result = await verifyAccessToken(tokens.accessToken)
    expect(result?.userId).toBe('user-1')
    expect(result?.username).toBe('tester')
  })

  it('rotateRefreshToken should rotate a valid refresh token', async () => {
    const tokens = await signTokens('user-2', 'tester')
    const rotated = await rotateRefreshToken(tokens.refreshToken)
    expect(rotated).not.toBeNull()
    expect(rotated?.accessToken).toBeTruthy()
    expect(rotated?.refreshToken).toBeTruthy()
    expect(rotated?.refreshToken).not.toBe(tokens.refreshToken)
  })
})
