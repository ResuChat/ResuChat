import type { Request } from 'express'
import type { AuthRequest } from './auth'
import { getUserRole } from '../services/user.service'
import type { UserRole } from '../types/domain'

export type AuthGuard = (req: AuthRequest) => Promise<boolean>
export type OwnerId = string | string[] | number | null | undefined
export type OwnerIdGetter = (req: Request) => OwnerId
export interface OwnerCheckContext {
  id: string
  authUserId: string
  req: AuthRequest
}
export type OwnerChecker = (context: OwnerCheckContext) => Promise<boolean>

/** 角色守卫 — 纯查询，不关心 req/res/next */
export function createRoleGuard(allowedRoles: UserRole[]) {
  return async (req: AuthRequest): Promise<boolean> => {
    const authUserId = req.auth?.userId
    if (!authUserId) return false
    const role = await getUserRole(authUserId)
    if (!role) return false
    return allowedRoles.includes(role)
  }
}

/** 资源所有权守卫工厂 — 具体归属判断由业务 service 提供 */
export function createOwnerGuard(getId: OwnerIdGetter, isOwner: OwnerChecker): AuthGuard {
  return async (req: AuthRequest): Promise<boolean> => {
    const authUserId = req.auth?.userId
    if (!authUserId) return false

    const ownerId = normalizeOwnerId(getId(req))
    if (!ownerId) return false
    return await isOwner({ id: ownerId, authUserId, req })
  }
}

function normalizeOwnerId(value: OwnerId): string | undefined {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    if (value.length !== 1) return undefined
    return normalizeOwnerId(value[0])
  }

  const normalized = String(value).trim()
  if (!normalized || normalized === 'undefined' || normalized === 'null') return undefined
  return normalized
}
