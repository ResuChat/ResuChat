import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthRequest } from '../src/middleware/auth'

const getUserRole = vi.fn()

vi.mock('../src/services/user.service', () => ({
  getUserRole
}))

type MockAuthRequest = Partial<AuthRequest> & {
  params?: Record<string, string | number>
}

function mockReq(req: MockAuthRequest): AuthRequest {
  return req as unknown as AuthRequest
}

describe('auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an owner guard from an id getter and service ownership checker', async () => {
    const isOwner = vi.fn().mockResolvedValue(true)
    const { createOwnerGuard } = await import('../src/middleware/authGuard')

    const guard = createOwnerGuard((req) => req.params.id, isOwner)
    const result = await guard(mockReq({
      auth: { userId: 'user-1' },
      params: { id: 'conv-1' }
    }))

    expect(result).toBe(true)
    expect(isOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conv-1',
        authUserId: 'user-1',
        req: expect.objectContaining({
          auth: expect.objectContaining({ userId: 'user-1' })
        })
      })
    )
  })

  it('normalizes numeric route ids before checking ownership', async () => {
    const isOwner = vi.fn().mockResolvedValue(true)
    const { createOwnerGuard } = await import('../src/middleware/authGuard')

    const guard = createOwnerGuard((req) => req.params.refId, isOwner)
    const result = await guard(mockReq({
      auth: { userId: 'user-1' },
      params: { refId: 12 }
    }))

    expect(result).toBe(true)
    expect(isOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '12',
        authUserId: 'user-1'
      })
    )
  })

  it('rejects missing ids before querying ownership', async () => {
    const isOwner = vi.fn()
    const { createOwnerGuard } = await import('../src/middleware/authGuard')

    const guard = createOwnerGuard((req) => req.params.refId, isOwner)
    const result = await guard(mockReq({
      auth: { userId: 'user-1' },
      params: { refId: 'undefined' }
    }))

    expect(result).toBe(false)
    expect(isOwner).not.toHaveBeenCalled()
  })

  it('rejects missing users before querying ownership', async () => {
    const isOwner = vi.fn()
    const { createOwnerGuard } = await import('../src/middleware/authGuard')

    const guard = createOwnerGuard((req) => req.params.id, isOwner)
    const result = await guard(mockReq({ params: { id: 'conv-1' } }))

    expect(result).toBe(false)
    expect(isOwner).not.toHaveBeenCalled()
  })

  it('checks role guard against current user role', async () => {
    getUserRole.mockResolvedValue('admin')
    const { createRoleGuard } = await import('../src/middleware/authGuard')

    const guard = createRoleGuard(['admin'])
    const result = await guard(mockReq({ auth: { userId: 'user-1' } }))

    expect(result).toBe(true)
    expect(getUserRole).toHaveBeenCalledWith('user-1')
  })

  it('combines auth guards with nested all any and not logic', async () => {
    const { all, any, not } = await import('../src/lib/auth-guards')
    const pass = vi.fn().mockResolvedValue(true)
    const fail = vi.fn().mockResolvedValue(false)

    const guard = any(all(pass, not(fail)), fail)
    const result = await guard(mockReq({ auth: { userId: 'user-1' } }))

    expect(result).toBe(true)
    expect(pass).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
  })

  it('short-circuits combined auth guards', async () => {
    const { all, any } = await import('../src/lib/auth-guards')
    const pass = vi.fn().mockResolvedValue(true)
    const fail = vi.fn().mockResolvedValue(false)
    const skipped = vi.fn().mockResolvedValue(true)

    await expect(all(fail, skipped)(mockReq({}))).resolves.toBe(false)
    await expect(any(pass, skipped)(mockReq({}))).resolves.toBe(true)

    expect(skipped).not.toHaveBeenCalled()
  })

  it('uses identity values for empty auth guard combinations', async () => {
    const { all, any } = await import('../src/lib/auth-guards')

    await expect(all()(mockReq({}))).resolves.toBe(true)
    await expect(any()(mockReq({}))).resolves.toBe(false)
  })
})
