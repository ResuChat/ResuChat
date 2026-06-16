import { and, asc, eq, max } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import type { Chunk, TypedChunk } from '../../types/domain'
import { logger } from '../../lib/logger'
import { sanitizeDatabaseText } from '../../lib/text'

export type { Chunk, TypedChunk } from '../../types/domain'

type ChunkRole = 'original' | 'reference' | 'modified'
type ChunkMetadata = Record<string, unknown>
type ChunkInput = {
  pageContent: string
  metadata?: ChunkMetadata
  role?: ChunkRole
  scope?: string
  category?: string
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeDatabaseText(value)
  if (Array.isArray(value)) return value.map(sanitizeJsonValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeJsonValue(item)
      ])
    )
  }
  return value
}

function sanitizeChunkForInsert(chunk: ChunkInput) {
  const sanitizedMetadata = sanitizeJsonValue(chunk.metadata ?? {})
  const metadata: ChunkMetadata =
    sanitizedMetadata && typeof sanitizedMetadata === 'object' && !Array.isArray(sanitizedMetadata)
      ? (sanitizedMetadata as ChunkMetadata)
      : {}
  return {
    ...chunk,
    pageContent: sanitizeDatabaseText(chunk.pageContent),
    metadata,
    source: typeof metadata.source === 'string' ? metadata.source : ''
  }
}

function defaultCategory(role: 'original' | 'reference' | 'modified'): 'resume' | 'unknown' {
  return role === 'reference' ? 'unknown' : 'resume'
}

function logChunkInsertFailure(
  operation: string,
  error: unknown,
  params: {
    conversationId: string
    chunks: ChunkInput[]
    refId?: number
    startIdx?: number
  }
) {
  const first = params.chunks[0]
  logger.error('Conversation chunk insert failed', {
    operation,
    conversationId: params.conversationId,
    refId: params.refId,
    chunkCount: params.chunks.length,
    startIdx: params.startIdx,
    firstChunkLength: first?.pageContent.length,
    firstChunkHasNullByte: first?.pageContent.includes('\u0000') ?? false,
    firstChunkSource: typeof first?.metadata?.source === 'string' ? first.metadata.source : '',
    firstChunkSourceHasNullByte:
      typeof first?.metadata?.source === 'string'
        ? first.metadata.source.includes('\u0000')
        : false,
    roles: Array.from(new Set(params.chunks.map((chunk) => chunk.role || 'original'))),
    categories: Array.from(
      new Set(
        params.chunks.map((chunk) => chunk.category || defaultCategory(chunk.role || 'original'))
      )
    ),
    error
  })
}

export async function getConversationChunks(conversationId: string): Promise<Chunk[]> {
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

export async function getConversationDocs(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ filePath: schema.globalDocuments.filePath })
    .from(schema.conversationDocumentRefs)
    .innerJoin(
      schema.globalDocuments,
      eq(schema.conversationDocumentRefs.globalDocId, schema.globalDocuments.id)
    )
    .where(eq(schema.conversationDocumentRefs.conversationId, conversationId))
  return rows.map((r) => r.filePath)
}

export async function setConversationChunks(conversationId: string, chunks: Chunk[]) {
  const now = Date.now()
  await db.transaction(async (tx) => {
    await tx.delete(schema.chunks).where(eq(schema.chunks.conversationId, conversationId))
    if (chunks.length > 0) {
      await tx.insert(schema.chunks).values(
        chunks.map((chunk, i) => {
          const sanitized = sanitizeChunkForInsert({
            pageContent: chunk.pageContent,
            metadata: chunk.metadata,
            role: 'original',
            category: 'resume'
          })
          return {
            conversationId,
            pageContent: sanitized.pageContent,
            metadata: sanitized.metadata,
            source: sanitized.source,
            chunkIndex: typeof chunk.metadata?.index === 'number' ? chunk.metadata.index : i,
            role: 'original',
            category: 'resume',
            createdAt: now
          }
        })
      )
    }
    await tx
      .update(schema.conversations)
      .set({ updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))
  })
}

export async function setConversationChunksWithTypes(
  conversationId: string,
  chunks: ChunkInput[],
  refId?: number
) {
  const now = Date.now()
  await db.transaction(async (tx) => {
    await tx.delete(schema.chunks).where(eq(schema.chunks.conversationId, conversationId))
    if (chunks.length > 0) {
      try {
        await tx.insert(schema.chunks).values(
          chunks.map((chunk, i) => {
            const sanitized = sanitizeChunkForInsert(chunk)
            const role = chunk.role || 'original'
            return {
              conversationId,
              pageContent: sanitized.pageContent,
              metadata: sanitized.metadata,
              source: sanitized.source,
              chunkIndex: i,
              role,
              refId: refId || null,
              scope: chunk.scope || 'conversation',
              category: chunk.category || defaultCategory(role),
              createdAt: now
            }
          })
        )
      } catch (error) {
        logChunkInsertFailure('setConversationChunksWithTypes', error, {
          conversationId,
          chunks,
          refId,
          startIdx: 0
        })
        throw error
      }
    }
    await tx
      .update(schema.conversations)
      .set({ updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))
  })
}

export async function appendConversationChunks(
  conversationId: string,
  chunks: ChunkInput[],
  refId?: number
) {
  const now = Date.now()
  await db.transaction(async (tx) => {
    const [maxIdx] = await tx
      .select({ value: max(schema.chunks.chunkIndex) })
      .from(schema.chunks)
      .where(eq(schema.chunks.conversationId, conversationId))
    const startIdx = (maxIdx?.value ?? -1) + 1

    if (chunks.length > 0) {
      try {
        await tx.insert(schema.chunks).values(
          chunks.map((chunk, i) => {
            const sanitized = sanitizeChunkForInsert(chunk)
            const role = chunk.role || 'original'
            return {
              conversationId,
              pageContent: sanitized.pageContent,
              metadata: sanitized.metadata,
              source: sanitized.source,
              chunkIndex: startIdx + i,
              role,
              refId: refId || null,
              scope: chunk.scope || 'conversation',
              category: chunk.category || defaultCategory(role),
              createdAt: now
            }
          })
        )
      } catch (error) {
        logChunkInsertFailure('appendConversationChunks', error, {
          conversationId,
          chunks,
          refId,
          startIdx
        })
        throw error
      }
    }
    await tx
      .update(schema.conversations)
      .set({ updatedAt: now })
      .where(eq(schema.conversations.id, conversationId))
  })
}

export async function deleteChunksByRefId(conversationId: string, refId: number): Promise<number> {
  const result = await db
    .delete(schema.chunks)
    .where(and(eq(schema.chunks.conversationId, conversationId), eq(schema.chunks.refId, refId)))
    .returning({ id: schema.chunks.id })
  return result.length
}

export async function getConversationChunksWithTypes(
  conversationId: string
): Promise<TypedChunk[]> {
  const rows = await db
    .select({
      pageContent: schema.chunks.pageContent,
      metadata: schema.chunks.metadata,
      role: schema.chunks.role,
      refId: schema.chunks.refId,
      scope: schema.chunks.scope,
      category: schema.chunks.category
    })
    .from(schema.chunks)
    .where(eq(schema.chunks.conversationId, conversationId))
    .orderBy(asc(schema.chunks.chunkIndex))
  return rows.map((r) => ({
    pageContent: r.pageContent,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    role: (r.role as 'original' | 'reference' | 'modified') || 'original',
    refId: r.refId ?? undefined,
    scope: r.scope ?? undefined,
    category: r.category ?? undefined
  }))
}
