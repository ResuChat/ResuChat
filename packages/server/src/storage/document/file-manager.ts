import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { and, asc, desc, eq, isNotNull, isNull, max } from 'drizzle-orm'
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
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  const fileSize = fileBuffer.length
  const fileName = `${fileHash}.${fileType}`
  const filePath = path.join(UPLOADS_DIR, fileName)

  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, fileBuffer)
    } catch (err) {
      throw new Error(`File write failed: ${err}`, { cause: err })
    }
  }

  const now = Date.now()
  const result = await db.transaction(async (tx) => {
    const [existingGlobal] = await tx
      .select({ id: schema.globalDocuments.id })
      .from(schema.globalDocuments)
      .where(eq(schema.globalDocuments.fileHash, fileHash))
      .limit(1)

    let globalDocId: number
    let isNewFile = false

    if (existingGlobal) {
      globalDocId = existingGlobal.id
    } else {
      const [created] = await tx
        .insert(schema.globalDocuments)
        .values({
          fileHash,
          filePath,
          originalName,
          fileType,
          fileSize,
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
        localName: options?.localName || originalName,
        sourceUserDocumentId: options?.sourceUserDocumentId ?? null,
        category: category || (role === 'reference' ? 'unknown' : 'resume'),
        contentSnapshot: contentSnapshot || null,
        createdAt: now
      })
      .returning({ id: schema.conversationDocumentRefs.id })

    return { globalDocId, refId: ref.id, isNewFile, version: newVersion, category }
  })

  return {
    globalDocId: result.globalDocId,
    refId: result.refId,
    filePath,
    isNewFile: result.isNewFile,
    version: result.version,
    category: result.category
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
  const refs = await db
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

  if (refs.length > maxVersions) {
    const toRemove = refs.slice(maxVersions)
    await db.transaction(async (tx) => {
      for (const ref of toRemove) {
        const [doc] = await tx
          .select({ filePath: schema.globalDocuments.filePath })
          .from(schema.globalDocuments)
          .where(eq(schema.globalDocuments.id, ref.globalDocId))
          .limit(1)

        await tx
          .delete(schema.conversationDocumentRefs)
          .where(eq(schema.conversationDocumentRefs.id, ref.id))

        if (doc && (await getGlobalDocRefCount(ref.globalDocId, tx)) <= 0) {
          if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath)
          await tx
            .delete(schema.globalDocuments)
            .where(eq(schema.globalDocuments.id, ref.globalDocId))
        }
      }
    })
  }
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
