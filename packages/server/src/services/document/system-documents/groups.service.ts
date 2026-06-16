import { ValidationError, NotFoundError } from '../../../lib/errors'
import { publishWsEvent } from '../../ws-events.service'
import {
  getSystemDocumentGroup,
  listSystemDocumentGroups as listGroups,
  ensureDefaultSystemDocumentGroup,
  createSystemDocumentGroup as createGroup,
  updateSystemDocumentGroup as updateGroup,
  setSystemDocumentGroupsActive,
  deleteSystemDocumentGroup as deleteGroup,
  countSystemDocumentGroupChildren,
  countSystemDocumentsInGroup,
  updateSystemDocumentsGroupName
} from '../../../storage/document/file-manager'
import {
  updateSystemChunksGroupName,
  isSystemVectorTableSchemaStaleError
} from '../../../lib/document/vector-db'
import type { SystemDocumentGroup } from '@resuchat/shared'

export async function listSystemGroups(): Promise<SystemDocumentGroup[]> {
  await ensureDefaultSystemDocumentGroup()
  return await listGroups()
}

export async function createSystemGroup(
  name: string,
  parentId: number | null
): Promise<SystemDocumentGroup> {
  const normalizedName = name.trim()
  if (!normalizedName) throw new ValidationError('Group name is required')
  let active = true
  if (parentId !== null) {
    if (!(await getSystemDocumentGroup(parentId))) {
      throw new ValidationError('Parent group not found')
    }
    active = await isGroupEffectivelyActive(parentId)
  }
  const group = await createGroup(normalizedName, parentId, active)
  await notifySystemKnowledgeChanged('group_created', { groupId: group.id, parentId })
  return group
}

export async function updateSystemGroup(
  id: number,
  data: { name?: string; parentId?: number | null; active?: boolean }
): Promise<SystemDocumentGroup> {
  const existing = await getSystemDocumentGroup(id)
  if (!existing) throw new NotFoundError('System document group not found')

  const groups = await listGroups()
  const next: { name?: string; parentId?: number | null; active?: boolean } = {}
  if (data.name !== undefined) {
    const normalizedName = data.name.trim()
    if (!normalizedName) throw new ValidationError('Group name is required')
    next.name = normalizedName
  }

  if (data.parentId !== undefined) {
    if (data.parentId === id) throw new ValidationError('Group cannot be moved under itself')
    if (data.parentId !== null && !(await getSystemDocumentGroup(data.parentId))) {
      throw new ValidationError('Parent group not found')
    }
    await assertNotDescendant(id, data.parentId)
    next.parentId = data.parentId
  }

  const targetParentId = data.parentId !== undefined ? data.parentId : existing.parent_id
  if (data.active === true && hasInactiveAncestor(id, groups, targetParentId)) {
    throw new ValidationError('Parent group is disabled')
  }

  const movedUnderDisabledParent =
    data.parentId !== undefined &&
    targetParentId !== null &&
    !isGroupActiveInTree(targetParentId, groups)

  if (data.active !== undefined) next.active = data.active
  if (movedUnderDisabledParent) next.active = false

  const updated = await updateGroup(id, next)
  if (!updated) throw new NotFoundError('System document group not found')

  if (next.name !== undefined && next.name !== existing.name) {
    await syncSystemDocumentGroupName(id, next.name)
  }

  if (data.active === false || movedUnderDisabledParent) {
    const ids = collectGroupIds(id, groups)
    await setSystemDocumentGroupsActive(ids, false)
    const refreshed = await getSystemDocumentGroup(id)
    if (!refreshed) throw new NotFoundError('System document group not found')
    await notifySystemKnowledgeChanged('group_updated', { groupId: id })
    return refreshed
  }

  await notifySystemKnowledgeChanged('group_updated', { groupId: id })
  return updated
}

export async function deleteSystemGroup(id: number): Promise<void> {
  const existing = await getSystemDocumentGroup(id)
  if (!existing) throw new NotFoundError('System document group not found')

  if ((await countSystemDocumentGroupChildren(id)) > 0) {
    throw new ValidationError('分组下还有子分组，不能删除')
  }
  if ((await countSystemDocumentsInGroup(id)) > 0) {
    throw new ValidationError('分组下还有文档，不能删除')
  }

  const changes = await deleteGroup(id)
  if (changes === 0) throw new NotFoundError('System document group not found')
  await notifySystemKnowledgeChanged('group_deleted', { groupId: id })
}

async function syncSystemDocumentGroupName(groupId: number, groupName: string): Promise<void> {
  await updateSystemDocumentsGroupName(groupId, groupName)
  try {
    await updateSystemChunksGroupName(groupId, groupName)
  } catch (error) {
    if (isSystemVectorTableSchemaStaleError(error)) {
      return
    }
  }
}

async function assertNotDescendant(id: number, parentId: number | null): Promise<void> {
  if (parentId === null) return
  const groups = await listGroups()
  let cursor: number | null = parentId
  while (cursor !== null) {
    if (cursor === id) throw new ValidationError('Group cannot be moved under its descendant')
    cursor = groups.find((group) => group.id === cursor)?.parent_id ?? null
  }
}

function collectGroupIds(rootId: number, groups: SystemDocumentGroup[]): number[] {
  const ids = new Set<number>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const group of groups) {
      if (group.parent_id !== null && ids.has(group.parent_id) && !ids.has(group.id)) {
        ids.add(group.id)
        changed = true
      }
    }
  }
  return Array.from(ids)
}

function hasInactiveAncestor(
  groupId: number,
  groups: SystemDocumentGroup[],
  parentIdOverride?: number | null
): boolean {
  let cursor =
    parentIdOverride !== undefined
      ? parentIdOverride
      : (groups.find((group) => group.id === groupId)?.parent_id ?? null)

  while (cursor !== null) {
    const parent = groups.find((group) => group.id === cursor)
    if (!parent) return false
    if (!parent.active) return true
    cursor = parent.parent_id
  }
  return false
}

function isGroupActiveInTree(groupId: number, groups: SystemDocumentGroup[]): boolean {
  const group = groups.find((item) => item.id === groupId)
  if (!group?.active) return false
  return !hasInactiveAncestor(groupId, groups)
}

async function isGroupEffectivelyActive(groupId: number): Promise<boolean> {
  const groups = await listGroups()
  return isGroupActiveInTree(groupId, groups)
}

async function notifySystemKnowledgeChanged(
  reason: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await publishWsEvent({
    target: 'role',
    role: 'admin',
    message: {
      type: 'system_knowledge_changed',
      payload: { reason, ...payload }
    }
  })
}
