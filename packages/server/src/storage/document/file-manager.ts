import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { and, asc, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { getGlobalDocRefCount } from './system-documents'
import type { FileAddResult, DocumentRef, ConversationDocInfo } from '../../types/domain'
import { logger } from '../../lib/logger'

// 从拆分的模块重导出
export * from '../document/system-documents'
export * from '../user/user-documents'

export type { FileAddResult, DocumentRef, ConversationDocInfo } from '../../types/domain'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'documents', 'by_hash')

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// ── Conversation Document Management ──

export interface AddFileToConversationOptions {
  localName?: string
  sourceUserDocumentId?: number
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

type PreparedConversationFile = {
  fileHash: string
  fileSize: number
  filePath: string
  isNewPhysicalFile: boolean
}

type InsertConversationFileRefParams = {
  conversationId: string
  preparedFile: PreparedConversationFile
  originalName: string
  fileType: string
  role: 'original' | 'reference' | 'modified'
  category?: string
  contentSnapshot?: string
  options?: AddFileToConversationOptions
  now?: number
}

function deletePhysicalFileIfExists(filePath: string, logContext: Record<string, unknown>) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (error) {
    logger.error('Failed to delete document file', { ...logContext, filePath, error })
  }
}

export function prepareConversationFile(
  fileBuffer: Buffer,
  fileType: string
): PreparedConversationFile {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  const fileSize = fileBuffer.length
  const fileName = `${fileHash}.${fileType}`
  const filePath = path.join(UPLOADS_DIR, fileName)
  let isNewPhysicalFile = false

  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, fileBuffer)
      isNewPhysicalFile = true
    } catch (err) {
      throw new Error(`File write failed: ${err}`, { cause: err })
    }
  }

  return { fileHash, fileSize, filePath, isNewPhysicalFile }
}

export async function insertConversationFileRef(
  tx: DbTransaction,
  params: InsertConversationFileRefParams
): Promise<FileAddResult> {
  const { conversationId, preparedFile, originalName, fileType, role, category, contentSnapshot } =
    params
  const now = params.now ?? Date.now()

  const [existingGlobal] = await tx
    .select({ id: schema.globalDocuments.id })
    .from(schema.globalDocuments)
    .where(eq(schema.globalDocuments.fileHash, preparedFile.fileHash))
    .limit(1)

  let globalDocId: number
  let isNewFile = false

  if (existingGlobal) {
    globalDocId = existingGlobal.id
  } else {
    const [created] = await tx
      .insert(schema.globalDocuments)
      .values({
        fileHash: preparedFile.fileHash,
        filePath: preparedFile.filePath,
        originalName,
        fileType,
        fileSize: preparedFile.fileSize,
        createdAt: now
      })
      .returning({ id: schema.globalDocuments.id })
    globalDocId = created.id
    isNewFile = true
  }

  const [maxVersion] = await tx
    .select({ value: max(schema.conversationDocumentRefs.version) })
    .from(schema.conversationDocumentRefs)
    .where(
      and(
        eq(schema.conversationDocumentRefs.conversationId, conversationId),
        eq(schema.conversationDocumentRefs.role, role)
      )
    )
  const newVersion = (maxVersion?.value ?? 0) + 1

  const [ref] = await tx
    .insert(schema.conversationDocumentRefs)
    .values({
      conversationId,
      globalDocId,
      role,
      version: newVersion,
      localName: params.options?.localName || originalName,
      sourceUserDocumentId: params.options?.sourceUserDocumentId ?? null,
      category: category || (role === 'reference' ? 'unknown' : 'resume'),
      contentSnapshot: contentSnapshot || null,
      createdAt: now
    })
    .returning({ id: schema.conversationDocumentRefs.id })

  return {
    globalDocId,
    refId: ref.id,
    filePath: preparedFile.filePath,
    isNewFile,
    version: newVersion,
    category
  }
}

export async function addFileToConversation(
  conversationId: string,
  fileBuffer: Buffer,
  originalName: string,
  fileType: string,
  role: 'original' | 'reference' | 'modified' = 'reference',
  category?: string,
  contentSnapshot?: string,
  options?: AddFileToConversationOptions
): Promise<FileAddResult> {
  const preparedFile = prepareConversationFile(fileBuffer, fileType)

  try {
    return await db.transaction((tx) =>
      insertConversationFileRef(tx, {
        conversationId,
        preparedFile,
        originalName,
        fileType,
        role,
        category,
        contentSnapshot,
        options
      })
    )
  } catch (error) {
    if (preparedFile.isNewPhysicalFile) {
      deletePhysicalFileIfExists(preparedFile.filePath, {
        operation: 'addFileToConversationRollback',
        conversationId,
        role
      })
    }
    throw error
  }
}

export async function removeFileFromConversation(
  conversationId: string,
  refId: number
): Promise<void> {
  const filesToDelete: string[] = []

  await db.transaction(async (tx) => {
    const [refDoc] = await tx
      .select({ globalDocId: schema.conversationDocumentRefs.globalDocId })
      .from(schema.conversationDocumentRefs)
      .where(
        and(
          eq(schema.conversationDocumentRefs.id, refId),
          eq(schema.conversationDocumentRefs.conversationId, conversationId)
        )
      )
      .limit(1)
    if (!refDoc) return

    const [doc] = await tx
      .select({ filePath: schema.globalDocuments.filePath })
      .from(schema.globalDocuments)
      .where(eq(schema.globalDocuments.id, refDoc.globalDocId))
      .limit(1)

    await tx
      .delete(schema.conversationDocumentRefs)
      .where(
        and(
          eq(schema.conversationDocumentRefs.id, refId),
          eq(schema.conversationDocumentRefs.conversationId, conversationId)
        )
      )

    if (doc && (await getGlobalDocRefCount(refDoc.globalDocId, tx)) <= 0) {
      filesToDelete.push(doc.filePath)
      await tx
        .delete(schema.globalDocuments)
        .where(eq(schema.globalDocuments.id, refDoc.globalDocId))
    }
  })

  for (const fp of filesToDelete) {
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp)
    } catch (error) {
      logger.error('Failed to delete unreferenced conversation document file', {
        conversationId,
        refId,
        filePath: fp,
        error
      })
    }
  }
}

export async function cleanupOldVersions(
  conversationId: string,
  role: string,
  maxVersions: number = 5
): Promise<void> {
  const filesToDelete = await db.transaction((tx) =>
    cleanupOldVersionsInTransaction(tx, conversationId, role, maxVersions)
  )

  for (const filePath of filesToDelete) {
    deletePhysicalFileIfExists(filePath, {
      operation: 'cleanupOldVersionsAfterCommit',
      conversationId,
      role
    })
  }
}

export async function cleanupOldVersionsInTransaction(
  tx: DbTransaction,
  conversationId: string,
  role: string,
  maxVersions: number = 5
): Promise<string[]> {
  const refs = await tx
    .select({
      id: schema.conversationDocumentRefs.id,
      globalDocId: schema.conversationDocumentRefs.globalDocId
    })
    .from(schema.conversationDocumentRefs)
    .where(
      and(
        eq(schema.conversationDocumentRefs.conversationId, conversationId),
        eq(schema.conversationDocumentRefs.role, role)
      )
    )
    .orderBy(desc(schema.conversationDocumentRefs.version))

  if (refs.length <= maxVersions) return []

  const toRemove = refs.slice(maxVersions)
  const refIds = toRemove.map((ref) => ref.id)
  const globalDocIds = Array.from(new Set(toRemove.map((ref) => ref.globalDocId)))

  const docs = await tx
    .select({ id: schema.globalDocuments.id, filePath: schema.globalDocuments.filePath })
    .from(schema.globalDocuments)
    .where(inArray(schema.globalDocuments.id, globalDocIds))

  await tx
    .delete(schema.conversationDocumentRefs)
    .where(inArray(schema.conversationDocumentRefs.id, refIds))

  const refCounts = await tx
    .select({
      globalDocId: schema.globalDocumentRefCounts.globalDocId,
      referenceCount: schema.globalDocumentRefCounts.referenceCount
    })
    .from(schema.globalDocumentRefCounts)
    .where(inArray(schema.globalDocumentRefCounts.globalDocId, globalDocIds))

  const remainingCountByGlobalDocId = new Map(
    refCounts.map((row) => [row.globalDocId, row.referenceCount ?? 0])
  )
  const deletableGlobalDocIds = globalDocIds.filter(
    (globalDocId) => (remainingCountByGlobalDocId.get(globalDocId) ?? 0) <= 0
  )

  if (deletableGlobalDocIds.length > 0) {
    await tx
      .delete(schema.globalDocuments)
      .where(inArray(schema.globalDocuments.id, deletableGlobalDocIds))
  }

  const deletableIdSet = new Set(deletableGlobalDocIds)
  return docs.filter((doc) => deletableIdSet.has(doc.id)).map((doc) => doc.filePath)
}

export async function getChunksForConversation(
  conversationId: string
): Promise<{ pageContent: string; metadata: Record<string, unknown> }[]> {
  const rows = await db
    .select({ pageContent: schema.chunks.pageContent, metadata: schema.chunks.metadata })
    .from(schema.chunks)
    .where(eq(schema.chunks.conversationId, conversationId))
    .orderBy(asc(schema.chunks.chunkIndex))
  return rows.map((r) => ({
    pageContent: r.pageContent,
    metadata: (r.metadata as Record<string, unknown>) ?? {}
  }))
}

export async function getDocumentRef(refId: number): Promise<DocumentRef | null> {
  const [row] = await db
    .select({
      ref: schema.conversationDocumentRefs,
      globalDoc: schema.globalDocuments
    })
    .from(schema.conversationDocumentRefs)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.conversationDocumentRefs.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.conversationDocumentRefs.id, refId))
    .limit(1)
  if (!row) return null
  return {
    id: row.ref.id,
    conversation_id: row.ref.conversationId,
    file_path: row.globalDoc.filePath,
    file_type: row.globalDoc.fileType,
    original_name: row.globalDoc.originalName,
    content_snapshot: row.ref.contentSnapshot,
    version: row.ref.version
  }
}

export async function isConversationDocumentOwner(refId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.conversationDocumentRefs.id })
    .from(schema.conversationDocumentRefs)
    .innerJoin(
      schema.conversations,
      eq(schema.conversationDocumentRefs.conversationId, schema.conversations.id)
    )
    .where(
      and(
        eq(schema.conversationDocumentRefs.id, refId),
        eq(schema.conversations.userId, userId),
        isNull(schema.conversations.deletedAt)
      )
    )
    .limit(1)
  return !!row
}

export async function getDocumentRefForUser(
  refId: number,
  userId: string
): Promise<{
  globalDocId: number
  localName: string
  contentSnapshot: string | null
  category: string | null
} | null> {
  const [row] = await db
    .select({
      globalDocId: schema.conversationDocumentRefs.globalDocId,
      localName: schema.conversationDocumentRefs.localName,
      sourceLocalName: schema.userDocuments.localName,
      contentSnapshot: schema.conversationDocumentRefs.contentSnapshot,
      category: schema.conversationDocumentRefs.category
    })
    .from(schema.conversationDocumentRefs)
    .innerJoin(
      schema.conversations,
      eq(schema.conversationDocumentRefs.conversationId, schema.conversations.id)
    )
    .leftJoin(
      schema.userDocuments,
      eq(schema.conversationDocumentRefs.sourceUserDocumentId, schema.userDocuments.id)
    )
    .where(
      and(eq(schema.conversationDocumentRefs.id, refId), eq(schema.conversations.userId, userId))
    )
    .limit(1)
  if (!row) return null
  return {
    globalDocId: row.globalDocId,
    localName: row.sourceLocalName || row.localName,
    contentSnapshot: row.contentSnapshot,
    category: row.category
  }
}

export async function getLatestConversationResumeSnapshot(
  conversationId: string
): Promise<string | null> {
  const [row] = await db
    .select({ contentSnapshot: schema.conversationDocumentRefs.contentSnapshot })
    .from(schema.conversationDocumentRefs)
    .where(
      and(
        eq(schema.conversationDocumentRefs.conversationId, conversationId),
        isNotNull(schema.conversationDocumentRefs.contentSnapshot)
      )
    )
    .orderBy(desc(schema.conversationDocumentRefs.createdAt))
    .limit(1)
  return row?.contentSnapshot ?? null
}

export async function updateDocumentRefSnapshot(refId: number, content: string): Promise<void> {
  await db
    .update(schema.conversationDocumentRefs)
    .set({ contentSnapshot: content })
    .where(eq(schema.conversationDocumentRefs.id, refId))
}

export async function getConversationDocsByType(
  conversationId: string,
  role?: string
): Promise<ConversationDocInfo[]> {
  const filters = [eq(schema.conversationDocumentRefs.conversationId, conversationId)]
  if (role) filters.push(eq(schema.conversationDocumentRefs.role, role))

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
    .where(and(...filters))
    .orderBy(desc(schema.conversationDocumentRefs.createdAt))

  return rows.map((r) => ({
    id: r.ref.id,
    original_name: r.globalDoc.originalName,
    local_name: r.sourceUserDoc?.localName || r.ref.localName,
    source_user_document_id: r.ref.sourceUserDocumentId,
    file_type: r.globalDoc.fileType,
    file_size: r.globalDoc.fileSize,
    file_path: r.globalDoc.filePath,
    role: r.ref.role,
    version: r.ref.version,
    created_at: r.ref.createdAt,
    category: r.ref.category ?? undefined
  }))
}
