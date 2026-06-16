import fs from 'fs'
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import type { Document, Conversation } from '../../types/domain'
import { CONVERSATION_TRASH_TTL_MS } from '../../lib/config'
import { getGlobalDocRefCount } from '../document/system-documents'
import { logger } from '../../lib/logger'

export type { Document, Conversation } from '../../types/domain'

export type DeletedConversation = Conversation & {
  deleted_at: number
  expires_at: number
}

export async function createConversation(id: string, userId: string, initialPrompt?: string) {
  const now = Date.now()
  await db.insert(schema.conversations).values({
    id,
    userId,
    initialPrompt: initialPrompt ?? null,
    createdAt: now,
    updatedAt: now
  })
}

export async function setInitialPrompt(id: string, prompt: string) {
  await db
    .update(schema.conversations)
    .set({ initialPrompt: prompt, updatedAt: Date.now() })
    .where(eq(schema.conversations.id, id))
}

export async function getInitialPrompt(id: string): Promise<string | null> {
  const [row] = await db
    .select({ initialPrompt: schema.conversations.initialPrompt })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1)
  return row?.initialPrompt || null
}

export async function updateConversationTitle(id: string, title: string) {
  await db
    .update(schema.conversations)
    .set({ title, updatedAt: Date.now() })
    .where(eq(schema.conversations.id, id))
}

export async function getConversationTitle(id: string): Promise<string | null> {
  const [row] = await db
    .select({ title: schema.conversations.title })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1)
  return row?.title || null
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const now = Date.now()
  await db
    .update(schema.conversations)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(schema.conversations.id, conversationId))
}

export async function restoreConversation(conversationId: string): Promise<void> {
  await db
    .update(schema.conversations)
    .set({ deletedAt: null, updatedAt: Date.now() })
    .where(eq(schema.conversations.id, conversationId))
}

export async function restoreConversationWithinTtl(
  conversationId: string,
  now = Date.now()
): Promise<boolean> {
  const cutoff = now - CONVERSATION_TRASH_TTL_MS
  const restored = await db
    .update(schema.conversations)
    .set({ deletedAt: null, updatedAt: now })
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        isNotNull(schema.conversations.deletedAt),
        gte(schema.conversations.deletedAt, cutoff)
      )
    )
    .returning({ id: schema.conversations.id })
  return restored.length > 0
}

export async function isConversationOwner(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.userId, userId),
        isNull(schema.conversations.deletedAt)
      )
    )
    .limit(1)
  return !!row
}

export async function isConversationParticipant(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId))
    )
    .limit(1)
  return !!row
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getUserConversations(
  userId: string,
  page: number,
  pageSize: number
): Promise<PaginatedResult<Conversation>> {
  const where = and(eq(schema.conversations.userId, userId), isNull(schema.conversations.deletedAt))
  const [total, data] = await Promise.all([
    db.select({ value: count() }).from(schema.conversations).where(where),
    db
      .select()
      .from(schema.conversations)
      .where(where)
      .orderBy(desc(schema.conversations.updatedAt))
      .offset((page - 1) * pageSize)
      .limit(pageSize)
  ])
  const totalCount = total[0]?.value ?? 0
  return {
    data: data.map(mapConversation),
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize)
  }
}

export async function getDeletedUserConversations(
  userId: string,
  page: number,
  pageSize: number,
  now = Date.now()
): Promise<PaginatedResult<DeletedConversation>> {
  const cutoff = now - CONVERSATION_TRASH_TTL_MS
  const where = and(
    eq(schema.conversations.userId, userId),
    isNotNull(schema.conversations.deletedAt),
    gte(schema.conversations.deletedAt, cutoff)
  )
  const [total, data] = await Promise.all([
    db.select({ value: count() }).from(schema.conversations).where(where),
    db
      .select()
      .from(schema.conversations)
      .where(where)
      .orderBy(desc(schema.conversations.deletedAt))
      .offset((page - 1) * pageSize)
      .limit(pageSize)
  ])
  const totalCount = total[0]?.value ?? 0
  return {
    data: data.map((row) => ({
      ...mapConversation(row),
      deleted_at: Number(row.deletedAt),
      expires_at: Number(row.deletedAt) + CONVERSATION_TRASH_TTL_MS
    })),
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize)
  }
}

export async function purgeExpiredDeletedConversations(now = Date.now()): Promise<{
  conversationsDeleted: number
  globalDocumentsDeleted: number
  filesDeleted: number
}> {
  const cutoff = now - CONVERSATION_TRASH_TTL_MS
  const filesToDelete: string[] = []
  let globalDocumentsDeleted = 0
  let conversationsDeleted = 0

  await db.transaction(async (tx) => {
    const expiredConversations = await tx
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(isNotNull(schema.conversations.deletedAt), lt(schema.conversations.deletedAt, cutoff))
      )

    const conversationIds = expiredConversations.map((row) => row.id)
    if (conversationIds.length === 0) return

    const docs = await tx
      .select({
        globalDocId: schema.conversationDocumentRefs.globalDocId,
        filePath: schema.globalDocuments.filePath
      })
      .from(schema.conversationDocumentRefs)
      .innerJoin(
        schema.globalDocuments,
        eq(schema.conversationDocumentRefs.globalDocId, schema.globalDocuments.id)
      )
      .where(inArray(schema.conversationDocumentRefs.conversationId, conversationIds))

    const deleted = await tx
      .delete(schema.conversations)
      .where(inArray(schema.conversations.id, conversationIds))
      .returning({ id: schema.conversations.id })
    conversationsDeleted = deleted.length

    const filePathByGlobalDocId = new Map<number, string>()
    for (const doc of docs) {
      filePathByGlobalDocId.set(doc.globalDocId, doc.filePath)
    }

    for (const [globalDocId, filePath] of filePathByGlobalDocId) {
      if ((await getGlobalDocRefCount(globalDocId, tx)) > 0) continue

      const deletedGlobalDocs = await tx
        .delete(schema.globalDocuments)
        .where(eq(schema.globalDocuments.id, globalDocId))
        .returning({ id: schema.globalDocuments.id })
      if (deletedGlobalDocs.length > 0) {
        globalDocumentsDeleted += deletedGlobalDocs.length
        filesToDelete.push(filePath)
      }
    }
  })

  let filesDeleted = 0
  for (const filePath of filesToDelete) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        filesDeleted += 1
      }
    } catch (error) {
      logger.error('Failed to delete purged conversation document file', {
        filePath,
        error
      })
    }
  }

  return { conversationsDeleted, globalDocumentsDeleted, filesDeleted }
}

export async function getConversationDocuments(conversationId: string): Promise<Document[]> {
  const rows = await db
    .select({
      ref: schema.conversationDocumentRefs,
      globalDoc: schema.globalDocuments,
      sourceUserDoc: {
        localName: schema.userDocuments.localName
      }
    })
    .from(schema.conversationDocumentRefs)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.conversationDocumentRefs.globalDocId, schema.globalDocuments.id)
    )
    .leftJoin(
      schema.userDocuments,
      eq(schema.conversationDocumentRefs.sourceUserDocumentId, schema.userDocuments.id)
    )
    .where(eq(schema.conversationDocumentRefs.conversationId, conversationId))
    .orderBy(desc(schema.conversationDocumentRefs.createdAt))
  return rows.map((r) => ({
    id: r.ref.id,
    conversation_id: r.ref.conversationId,
    file_path: r.globalDoc.filePath,
    file_url: `/documents/${r.ref.id}/download`,
    file_type: r.globalDoc.fileType,
    file_size: r.globalDoc.fileSize,
    original_name: r.globalDoc.originalName,
    local_name: r.sourceUserDoc?.localName || r.ref.localName,
    source_user_document_id: r.ref.sourceUserDocumentId,
    created_at: r.ref.createdAt,
    role: r.ref.role
  }))
}

function mapConversation(row: typeof schema.conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    status: row.status,
    created_at: Number(row.createdAt),
    updated_at: Number(row.updatedAt)
  }
}
