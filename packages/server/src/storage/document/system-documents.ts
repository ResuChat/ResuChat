import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { normalizeDocumentCategory } from '@resuchat/shared'
import { db, schema } from '../../lib/db'
import type { SystemDocRecord, SystemDocumentGroup } from '../../types/domain'

export type { SystemDocRecord, SystemDocumentGroup } from '../../types/domain'

// ── GlobalDocument 辅助 ──

export async function findGlobalDocByHash(hash: string): Promise<{ id: number } | undefined> {
  const [doc] = await db
    .select({ id: schema.globalDocuments.id })
    .from(schema.globalDocuments)
    .where(eq(schema.globalDocuments.fileHash, hash))
    .limit(1)
  return doc ?? undefined
}

export async function createGlobalDocument(
  hash: string,
  filePath: string,
  name: string,
  type: string,
  size: number
): Promise<number> {
  const [doc] = await db
    .insert(schema.globalDocuments)
    .values({
      fileHash: hash,
      filePath,
      originalName: name,
      fileType: type,
      fileSize: size,
      createdAt: Date.now()
    })
    .returning({ id: schema.globalDocuments.id })
  return doc.id
}

export async function getGlobalDocRefCount(
  id: number,
  client: Pick<typeof db, 'select'> = db
): Promise<number> {
  const [row] = await client
    .select({ referenceCount: schema.globalDocumentRefCounts.referenceCount })
    .from(schema.globalDocumentRefCounts)
    .where(eq(schema.globalDocumentRefCounts.globalDocId, id))
    .limit(1)
  return row?.referenceCount ?? 0
}

export async function deleteGlobalDocument(id: number): Promise<void> {
  await db.delete(schema.globalDocuments).where(eq(schema.globalDocuments.id, id))
}

// ── SystemDocument CRUD ──

function mapSystemGroup(
  row: typeof schema.systemDocumentGroups.$inferSelect,
  documentCount = 0
): SystemDocumentGroup {
  return {
    id: row.id,
    parent_id: row.parentId,
    name: row.name,
    active: row.active,
    document_count: documentCount,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  }
}

export async function listSystemDocumentGroups(): Promise<SystemDocumentGroup[]> {
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.systemDocumentGroups)
      .orderBy(schema.systemDocumentGroups.parentId, schema.systemDocumentGroups.createdAt),
    db
      .select({
        groupId: schema.systemDocuments.groupId,
        value: count(schema.systemDocuments.id)
      })
      .from(schema.systemDocuments)
      .groupBy(schema.systemDocuments.groupId)
  ])

  const countByGroupId = new Map<number, number>()
  for (const row of countRows) {
    if (row.groupId !== null) countByGroupId.set(row.groupId, row.value)
  }

  return rows.map((row) => mapSystemGroup(row, countByGroupId.get(row.id) ?? 0))
}

export async function getSystemDocumentGroup(id: number): Promise<SystemDocumentGroup | null> {
  const [row] = await db
    .select()
    .from(schema.systemDocumentGroups)
    .where(eq(schema.systemDocumentGroups.id, id))
    .limit(1)
  if (!row) return null
  return mapSystemGroup(row, await countSystemDocumentsInGroup(row.id))
}

export async function ensureDefaultSystemDocumentGroup(): Promise<SystemDocumentGroup> {
  const [existing] = await db
    .select()
    .from(schema.systemDocumentGroups)
    .orderBy(schema.systemDocumentGroups.createdAt)
    .limit(1)
  if (existing) return mapSystemGroup(existing, await countSystemDocumentsInGroup(existing.id))

  const now = Date.now()
  const [created] = await db
    .insert(schema.systemDocumentGroups)
    .values({ name: '默认', parentId: null, createdAt: now, updatedAt: now })
    .returning()
  return mapSystemGroup(created)
}

export async function createSystemDocumentGroup(
  name: string,
  parentId: number | null,
  active = true
): Promise<SystemDocumentGroup> {
  const now = Date.now()
  const [created] = await db
    .insert(schema.systemDocumentGroups)
    .values({ name, parentId, active, createdAt: now, updatedAt: now })
    .returning()
  return mapSystemGroup(created)
}

export async function updateSystemDocumentGroup(
  id: number,
  data: { name?: string; parentId?: number | null; active?: boolean }
): Promise<SystemDocumentGroup | null> {
  const changes: Partial<typeof schema.systemDocumentGroups.$inferInsert> = {
    updatedAt: Date.now()
  }
  if (data.name !== undefined) changes.name = data.name
  if (data.parentId !== undefined) changes.parentId = data.parentId
  if (data.active !== undefined) changes.active = data.active

  const [updated] = await db
    .update(schema.systemDocumentGroups)
    .set(changes)
    .where(eq(schema.systemDocumentGroups.id, id))
    .returning()
  return updated ? mapSystemGroup(updated) : null
}

export async function updateSystemDocumentsGroupName(
  groupId: number,
  groupName: string
): Promise<number> {
  const result = await db
    .update(schema.systemDocuments)
    .set({ groupName, updatedAt: Date.now() })
    .where(eq(schema.systemDocuments.groupId, groupId))
    .returning({ id: schema.systemDocuments.id })
  return result.length
}

export async function setSystemDocumentGroupsActive(
  ids: number[],
  active: boolean
): Promise<number> {
  if (ids.length === 0) return 0
  const result = await db
    .update(schema.systemDocumentGroups)
    .set({ active, updatedAt: Date.now() })
    .where(inArray(schema.systemDocumentGroups.id, ids))
    .returning({ id: schema.systemDocumentGroups.id })
  return result.length
}

export async function countSystemDocumentGroupChildren(id: number): Promise<number> {
  const rows = await db
    .select({ id: schema.systemDocumentGroups.id })
    .from(schema.systemDocumentGroups)
    .where(eq(schema.systemDocumentGroups.parentId, id))
  return rows.length
}

export async function countSystemDocumentsInGroup(id: number): Promise<number> {
  const rows = await db
    .select({ id: schema.systemDocuments.id })
    .from(schema.systemDocuments)
    .where(eq(schema.systemDocuments.groupId, id))
  return rows.length
}

export async function deleteSystemDocumentGroup(id: number): Promise<number> {
  const result = await db
    .delete(schema.systemDocumentGroups)
    .where(eq(schema.systemDocumentGroups.id, id))
    .returning({ id: schema.systemDocumentGroups.id })
  return result.length
}

export async function getSearchableSystemDocumentIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set()
  const activeGroupIds = await listEffectivelyActiveSystemDocumentGroupIds()
  if (activeGroupIds.length === 0) return new Set()

  const rows = await db
    .select({
      id: schema.systemDocuments.id
    })
    .from(schema.systemDocuments)
    .where(
      and(
        inArray(schema.systemDocuments.id, ids),
        eq(schema.systemDocuments.active, true),
        inArray(schema.systemDocuments.groupId, activeGroupIds)
      )
    )

  return new Set(rows.map((row) => row.id))
}

export async function listEffectivelyActiveSystemDocumentGroupIds(): Promise<number[]> {
  const rows = await db
    .select({
      id: schema.systemDocumentGroups.id,
      parentId: schema.systemDocumentGroups.parentId,
      active: schema.systemDocumentGroups.active
    })
    .from(schema.systemDocumentGroups)

  const groupsById = new Map(rows.map((row) => [row.id, row]))
  const cache = new Map<number, boolean>()

  function isActiveInTree(groupId: number, seen = new Set<number>()): boolean {
    const cached = cache.get(groupId)
    if (cached !== undefined) return cached

    const group = groupsById.get(groupId)
    if (!group?.active) {
      cache.set(groupId, false)
      return false
    }
    if (group.parentId === null) {
      cache.set(groupId, true)
      return true
    }
    if (seen.has(groupId)) {
      cache.set(groupId, false)
      return false
    }

    seen.add(groupId)
    const parent = groupsById.get(group.parentId)
    const active = parent ? isActiveInTree(parent.id, seen) : true
    cache.set(groupId, active)
    return active
  }

  return rows.filter((row) => isActiveInTree(row.id)).map((row) => row.id)
}

export async function createSystemDocument(
  globalDocId: number,
  groupId: number,
  groupName: string,
  localName: string
): Promise<number> {
  const now = Date.now()
  const [created] = await db
    .insert(schema.systemDocuments)
    .values({
      globalDocId,
      groupId,
      category: 'unknown',
      groupName,
      localName,
      indexStatus: 'pending',
      chunksCount: 0,
      createdAt: now,
      updatedAt: now
    })
    .returning({ id: schema.systemDocuments.id })
  return created.id
}

export async function updateSystemDocumentIndexState(
  id: number,
  data: {
    status: 'pending' | 'indexing' | 'done' | 'failed'
    category?: 'resume' | 'job' | 'unknown'
    chunksCount?: number
    errorMessage?: string | null
    indexedAt?: number | null
  }
): Promise<void> {
  const changes: Partial<typeof schema.systemDocuments.$inferInsert> = {
    indexStatus: data.status,
    updatedAt: Date.now()
  }
  if (data.category !== undefined) changes.category = data.category
  if (data.chunksCount !== undefined) changes.chunksCount = data.chunksCount
  if (data.errorMessage !== undefined) changes.errorMessage = data.errorMessage
  if (data.indexedAt !== undefined) changes.indexedAt = data.indexedAt

  await db.update(schema.systemDocuments).set(changes).where(eq(schema.systemDocuments.id, id))
}

export async function requeuePendingSystemDocuments(ids: number[]): Promise<number[]> {
  const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isInteger(id) && id > 0)
  if (uniqueIds.length === 0) return []

  const rows = await db
    .update(schema.systemDocuments)
    .set({
      indexStatus: 'pending',
      errorMessage: null,
      chunksCount: 0,
      indexedAt: null,
      updatedAt: Date.now()
    })
    .where(
      and(
        inArray(schema.systemDocuments.id, uniqueIds),
        inArray(schema.systemDocuments.indexStatus, ['pending', 'indexing'])
      )
    )
    .returning({ id: schema.systemDocuments.id })

  return rows.map((row) => row.id)
}

export async function getSystemDocumentIndexTarget(id: number): Promise<
  | {
      id: number
      globalDocId: number
      groupId: number | null
      groupName: string
      localName: string
      filePath: string
      originalName: string
      fileType: string
      fileSize: number
      active: boolean
    }
  | undefined
> {
  const [row] = await db
    .select({
      systemDoc: schema.systemDocuments,
      globalDoc: schema.globalDocuments
    })
    .from(schema.systemDocuments)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.systemDocuments.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.systemDocuments.id, id))
    .limit(1)
  if (!row) return undefined
  return {
    id: row.systemDoc.id,
    globalDocId: row.systemDoc.globalDocId,
    groupId: row.systemDoc.groupId,
    groupName: row.systemDoc.groupName,
    localName: row.systemDoc.localName,
    filePath: row.globalDoc.filePath,
    originalName: row.globalDoc.originalName,
    fileType: row.globalDoc.fileType,
    fileSize: row.globalDoc.fileSize,
    active: row.systemDoc.active
  }
}

export async function findSystemDocByGlobalDocAndGroup(
  globalDocId: number,
  groupId: number
): Promise<{ id: number } | undefined> {
  const [row] = await db
    .select({ id: schema.systemDocuments.id })
    .from(schema.systemDocuments)
    .where(
      and(
        eq(schema.systemDocuments.globalDocId, globalDocId),
        eq(schema.systemDocuments.groupId, groupId)
      )
    )
    .limit(1)
  return row ?? undefined
}

export async function requeueSystemDocument(
  id: number,
  groupName: string,
  localName: string
): Promise<void> {
  await db
    .update(schema.systemDocuments)
    .set({
      groupName,
      localName,
      indexStatus: 'pending',
      errorMessage: null,
      chunksCount: 0,
      indexedAt: null,
      updatedAt: Date.now()
    })
    .where(eq(schema.systemDocuments.id, id))
}

export async function findSystemDocById(
  id: number
): Promise<{ global_doc_id: number; file_path: string } | undefined> {
  const [row] = await db
    .select({
      globalDocId: schema.systemDocuments.globalDocId,
      filePath: schema.globalDocuments.filePath
    })
    .from(schema.systemDocuments)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.systemDocuments.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.systemDocuments.id, id))
    .limit(1)
  if (!row) return undefined
  return { global_doc_id: row.globalDocId, file_path: row.filePath }
}

export async function deleteSystemDocument(id: number): Promise<void> {
  await db.delete(schema.systemDocuments).where(eq(schema.systemDocuments.id, id))
}

export async function listSystemDocuments(): Promise<SystemDocRecord[]> {
  const rows = await db
    .select({
      systemDoc: schema.systemDocuments,
      globalDoc: schema.globalDocuments
    })
    .from(schema.systemDocuments)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.systemDocuments.globalDocId, schema.globalDocuments.id)
    )
    .orderBy(desc(schema.systemDocuments.createdAt))
  return rows.map((r) => ({
    id: r.systemDoc.id,
    global_doc_id: r.systemDoc.globalDocId,
    group_id: r.systemDoc.groupId,
    category: normalizeDocumentCategory(r.systemDoc.category),
    group_name: r.systemDoc.groupName,
    local_name: r.systemDoc.localName,
    active: r.systemDoc.active,
    index_status: r.systemDoc.indexStatus as 'pending' | 'indexing' | 'done' | 'failed',
    error_message: r.systemDoc.errorMessage,
    chunks_count: r.systemDoc.chunksCount,
    indexed_at: r.systemDoc.indexedAt,
    created_at: r.systemDoc.createdAt,
    updated_at: r.systemDoc.updatedAt,
    file_type: r.globalDoc.fileType,
    file_size: r.globalDoc.fileSize,
    original_name: r.globalDoc.originalName
  }))
}

export async function getSystemDocumentById(id: number): Promise<SystemDocRecord | undefined> {
  const [row] = await db
    .select({
      systemDoc: schema.systemDocuments,
      globalDoc: schema.globalDocuments
    })
    .from(schema.systemDocuments)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.systemDocuments.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.systemDocuments.id, id))
    .limit(1)
  if (!row) return undefined
  return {
    id: row.systemDoc.id,
    global_doc_id: row.systemDoc.globalDocId,
    group_id: row.systemDoc.groupId,
    category: normalizeDocumentCategory(row.systemDoc.category),
    group_name: row.systemDoc.groupName,
    local_name: row.systemDoc.localName,
    active: row.systemDoc.active,
    index_status: row.systemDoc.indexStatus as 'pending' | 'indexing' | 'done' | 'failed',
    error_message: row.systemDoc.errorMessage,
    chunks_count: row.systemDoc.chunksCount,
    indexed_at: row.systemDoc.indexedAt,
    created_at: row.systemDoc.createdAt,
    updated_at: row.systemDoc.updatedAt,
    file_type: row.globalDoc.fileType,
    file_size: row.globalDoc.fileSize,
    original_name: row.globalDoc.originalName,
    file_path: row.globalDoc.filePath
  }
}

export async function updateSystemDocumentActive(id: number, active: boolean): Promise<number> {
  const result = await db
    .update(schema.systemDocuments)
    .set({ active, updatedAt: Date.now() })
    .where(eq(schema.systemDocuments.id, id))
    .returning({ id: schema.systemDocuments.id })
  return result.length
}
