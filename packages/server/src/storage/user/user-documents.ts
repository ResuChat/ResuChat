import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { and, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { getGlobalDocRefCount } from '../document/system-documents'
import { logger } from '../../lib/logger'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'documents', 'by_hash')

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

export interface UserDocInfo {
  id: number
  globalDocId: number
  localName: string
  originalName: string
  fileType: string
  fileSize: number
  source: string
  parseStatus: string
  contentCategory: string | null
  createdAt: number
}

export interface UserDocFileInfo {
  id: number
  userId: string
  globalDocId: number
  localName: string
  originalName: string
  fileType: string
  filePath: string
  parseStatus: string
  contentCategory: string | null
  markdownContent: string | null
}

// ── UserDocument 用户文档库 ──

export async function addToUserLibrary(
  userId: string,
  globalDocId: number,
  localName: string,
  source: 'conversation' | 'upload' = 'conversation',
  markdownContent?: string,
  category?: string
): Promise<{ id: number }> {
  const name = localName.replace(/\.[^.]+$/, '')
  const hasUpdate = markdownContent || category
  const [doc] = await db
    .insert(schema.userDocuments)
    .values({
      userId,
      globalDocId,
      localName: name,
      source,
      parseStatus: markdownContent ? 'done' : 'pending',
      category: category || 'unknown',
      markdownContent: markdownContent || null,
      createdAt: Date.now()
    })
    .onConflictDoUpdate({
      target: [schema.userDocuments.userId, schema.userDocuments.globalDocId],
      set: hasUpdate
        ? {
            ...(markdownContent ? { parseStatus: 'done' } : {}),
            ...(category ? { category } : {}),
            ...(markdownContent ? { markdownContent } : {})
          }
        : { localName: sql`${schema.userDocuments.localName}` }
    })
    .returning({ id: schema.userDocuments.id })
  return { id: doc.id }
}

export async function getUserDocWithFile(
  userId: string,
  docId: number
): Promise<{
  buffer: Buffer
  originalName: string
  localName: string
  fileType: string
  markdown: string | null
  contentCategory: string | null
} | null> {
  const [doc] = await db
    .select({ userDoc: schema.userDocuments, globalDoc: schema.globalDocuments })
    .from(schema.userDocuments)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.userDocuments.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.userDocuments.id, docId))
    .limit(1)
  if (!doc || doc.userDoc.userId !== userId) return null
  if (!fs.existsSync(doc.globalDoc.filePath)) return null
  return {
    buffer: fs.readFileSync(doc.globalDoc.filePath),
    originalName: doc.globalDoc.originalName,
    localName: doc.userDoc.localName,
    fileType: doc.globalDoc.fileType,
    markdown: doc.userDoc.markdownContent,
    contentCategory: doc.userDoc.category
  }
}

export async function getUserDocFileInfo(id: number): Promise<UserDocFileInfo | null> {
  const [doc] = await db
    .select({ userDoc: schema.userDocuments, globalDoc: schema.globalDocuments })
    .from(schema.userDocuments)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.userDocuments.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.userDocuments.id, id))
    .limit(1)
  if (!doc) return null
  return {
    id: doc.userDoc.id,
    userId: doc.userDoc.userId,
    globalDocId: doc.userDoc.globalDocId,
    localName: doc.userDoc.localName,
    originalName: doc.globalDoc.originalName,
    fileType: doc.globalDoc.fileType,
    filePath: doc.globalDoc.filePath,
    parseStatus: doc.userDoc.parseStatus,
    contentCategory: doc.userDoc.category,
    markdownContent: doc.userDoc.markdownContent
  }
}

export async function listUserDocuments(
  userId: string,
  opts?: {
    search?: string
    fileType?: string
    category?: string
    parseStatus?: string
    page?: number
    pageSize?: number
  }
): Promise<{ data: UserDocInfo[]; total: number }> {
  const page = opts?.page || 1
  const pageSize = opts?.pageSize || 20
  const filters: SQL[] = [eq(schema.userDocuments.userId, userId)]
  if (opts?.search) filters.push(ilike(schema.userDocuments.localName, `%${opts.search}%`))
  if (opts?.category) filters.push(eq(schema.userDocuments.category, opts.category))
  if (opts?.parseStatus) filters.push(eq(schema.userDocuments.parseStatus, opts.parseStatus))
  if (opts?.fileType) {
    const t = opts.fileType
    if (t === 'docx') filters.push(inArray(schema.globalDocuments.fileType, ['doc', 'docx']))
    else if (t === 'txt') filters.push(inArray(schema.globalDocuments.fileType, ['txt', 'md']))
    else filters.push(eq(schema.globalDocuments.fileType, t))
  }
  const where = and(...filters)
  const [total, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.userDocuments)
      .innerJoin(
        schema.globalDocuments,
        eq(schema.userDocuments.globalDocId, schema.globalDocuments.id)
      )
      .where(where),
    db
      .select({ userDoc: schema.userDocuments, globalDoc: schema.globalDocuments })
      .from(schema.userDocuments)
      .innerJoin(
        schema.globalDocuments,
        eq(schema.userDocuments.globalDocId, schema.globalDocuments.id)
      )
      .where(where)
      .orderBy(desc(schema.userDocuments.createdAt))
      .offset((page - 1) * pageSize)
      .limit(pageSize)
  ])
  return {
    total: total[0]?.value ?? 0,
    data: rows.map((r) => ({
      id: r.userDoc.id,
      globalDocId: r.userDoc.globalDocId,
      localName: r.userDoc.localName,
      originalName: r.globalDoc.originalName,
      fileType: r.globalDoc.fileType,
      fileSize: r.globalDoc.fileSize,
      source: r.userDoc.source,
      parseStatus: r.userDoc.parseStatus,
      contentCategory: r.userDoc.category,
      createdAt: r.userDoc.createdAt
    }))
  }
}

export async function updateUserDocName(id: number, localName: string): Promise<void> {
  await db.update(schema.userDocuments).set({ localName }).where(eq(schema.userDocuments.id, id))
}

export async function deleteUserDocument(
  id: number
): Promise<{ globalDocId: number; refCount: number }> {
  const [doc] = await db
    .select({
      userDoc: schema.userDocuments,
      filePath: schema.globalDocuments.filePath
    })
    .from(schema.userDocuments)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.userDocuments.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.userDocuments.id, id))
    .limit(1)
  if (!doc) throw new Error('Document not found')
  let refCount = 0
  const filePath = doc.filePath

  await db.transaction(async (tx) => {
    await tx.delete(schema.userDocuments).where(eq(schema.userDocuments.id, id))
    refCount = await getGlobalDocRefCount(doc.userDoc.globalDocId, tx)
    if (refCount <= 0) {
      await tx
        .delete(schema.globalDocuments)
        .where(eq(schema.globalDocuments.id, doc.userDoc.globalDocId))
    }
  })

  if (refCount <= 0) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (error) {
      logger.error('Failed to delete unreferenced user document file', { filePath, error })
    }
  }

  return { globalDocId: doc.userDoc.globalDocId, refCount }
}

export async function getUserDocById(
  id: number
): Promise<{ id: number; globalDocId: number; userId: string; localName: string } | null> {
  const [doc] = await db
    .select({
      id: schema.userDocuments.id,
      globalDocId: schema.userDocuments.globalDocId,
      userId: schema.userDocuments.userId,
      localName: schema.userDocuments.localName
    })
    .from(schema.userDocuments)
    .where(eq(schema.userDocuments.id, id))
    .limit(1)
  return doc ?? null
}

export async function isUserDocumentOwner(docId: number, userId: string): Promise<boolean> {
  const [doc] = await db
    .select({ id: schema.userDocuments.id })
    .from(schema.userDocuments)
    .where(and(eq(schema.userDocuments.id, docId), eq(schema.userDocuments.userId, userId)))
    .limit(1)
  return !!doc
}

/** 独立上传文档到用户文档库（不绑定对话） */
export async function uploadUserDocument(
  userId: string,
  fileBuffer: Buffer,
  originalName: string
): Promise<{ id: number; globalDocId: number; filePath: string; originalName: string }> {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  const ext = originalName.toLowerCase().split('.').pop() || 'bin'
  const fileName = `${fileHash}.${ext}`
  const filePath = path.join(UPLOADS_DIR, fileName)

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, fileBuffer)
  }

  const [globalDoc] = await db
    .insert(schema.globalDocuments)
    .values({
      fileHash,
      filePath,
      originalName,
      fileType: ext,
      fileSize: fileBuffer.length,
      createdAt: Date.now()
    })
    .onConflictDoUpdate({
      target: schema.globalDocuments.fileHash,
      set: { filePath: sql`${schema.globalDocuments.filePath}` }
    })
    .returning({ id: schema.globalDocuments.id })

  const [userDoc] = await db
    .insert(schema.userDocuments)
    .values({
      userId,
      globalDocId: globalDoc.id,
      localName: originalName.replace(/\.[^.]+$/, ''),
      source: 'upload',
      parseStatus: 'parsing',
      category: 'unknown',
      createdAt: Date.now()
    })
    .onConflictDoUpdate({
      target: [schema.userDocuments.userId, schema.userDocuments.globalDocId],
      set: { localName: sql`${schema.userDocuments.localName}` }
    })
    .returning({ id: schema.userDocuments.id })

  return { id: userDoc.id, globalDocId: globalDoc.id, filePath, originalName }
}

export async function updateUserDocumentParseResult(
  id: number,
  data: {
    parseStatus: string
    category?: string
    markdownContent?: string | null
  },
  onlyWhenParsing = false
): Promise<number> {
  const filters = [eq(schema.userDocuments.id, id)]
  if (onlyWhenParsing) filters.push(eq(schema.userDocuments.parseStatus, 'parsing'))
  const updated = await db
    .update(schema.userDocuments)
    .set(data)
    .where(and(...filters))
    .returning({ id: schema.userDocuments.id })
  return updated.length
}

export async function markUserDocumentParsing(id: number): Promise<void> {
  await db
    .update(schema.userDocuments)
    .set({ parseStatus: 'parsing' })
    .where(eq(schema.userDocuments.id, id))
}

export async function cancelUserDocumentParsing(id: number): Promise<number> {
  const updated = await db
    .update(schema.userDocuments)
    .set({ parseStatus: 'failed' })
    .where(and(eq(schema.userDocuments.id, id), eq(schema.userDocuments.parseStatus, 'parsing')))
    .returning({ id: schema.userDocuments.id })
  return updated.length
}

export async function resetParsingUserDocuments(): Promise<number> {
  const cleaned = await db
    .update(schema.userDocuments)
    .set({ parseStatus: 'failed' })
    .where(eq(schema.userDocuments.parseStatus, 'parsing'))
    .returning({ id: schema.userDocuments.id })
  return cleaned.length
}

export async function resetPendingUserDocuments(): Promise<number> {
  const cleaned = await db
    .update(schema.userDocuments)
    .set({ parseStatus: 'failed' })
    .where(eq(schema.userDocuments.parseStatus, 'pending'))
    .returning({ id: schema.userDocuments.id })
  return cleaned.length
}

export async function findUserDocumentByGlobalDoc(
  userId: string,
  globalDocId: number
): Promise<{ id: number; localName: string } | null> {
  const [doc] = await db
    .select({ id: schema.userDocuments.id, localName: schema.userDocuments.localName })
    .from(schema.userDocuments)
    .where(
      and(
        eq(schema.userDocuments.userId, userId),
        eq(schema.userDocuments.globalDocId, globalDocId)
      )
    )
    .limit(1)
  return doc ?? null
}
