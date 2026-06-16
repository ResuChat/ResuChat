import { and, asc, count, desc, eq, gt, gte, inArray, lte } from 'drizzle-orm'
import { db, schema } from '../../lib/db'

export type SummaryMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

export type ConversationSummaryRow = {
  id: number
  summary: string
  messageCount: number
  startMessageId: number
  endMessageId: number
}

export async function countUnsummarizedMessages(conversationId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.messages)
    .where(
      and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.summarized, false))
    )
  return row?.value ?? 0
}

export async function getLastSummaryEndMessageId(conversationId: string): Promise<number | null> {
  const [row] = await db
    .select({ endMessageId: schema.conversationSummaries.endMessageId })
    .from(schema.conversationSummaries)
    .where(eq(schema.conversationSummaries.conversationId, conversationId))
    .orderBy(desc(schema.conversationSummaries.endMessageId))
    .limit(1)

  return row?.endMessageId ?? null
}

export async function listUnsummarizedMessages(
  conversationId: string,
  options: { limit?: number; afterMessageId?: number } = {}
): Promise<SummaryMessage[]> {
  const filters = [
    eq(schema.messages.conversationId, conversationId),
    eq(schema.messages.summarized, false)
  ]
  if (options.afterMessageId !== undefined) {
    filters.push(gt(schema.messages.id, options.afterMessageId))
  }

  let query = db
    .select({
      id: schema.messages.id,
      role: schema.messages.role,
      content: schema.messages.content
    })
    .from(schema.messages)
    .where(and(...filters))
    .orderBy(asc(schema.messages.createdAt))

  if (options.limit !== undefined) {
    query = query.limit(options.limit) as typeof query
  }

  const rows = await query
  return rows.map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content
  }))
}

export async function getLatestSummaryText(conversationId: string): Promise<string | null> {
  const [row] = await db
    .select({ summary: schema.conversationSummaries.summary })
    .from(schema.conversationSummaries)
    .where(eq(schema.conversationSummaries.conversationId, conversationId))
    .orderBy(desc(schema.conversationSummaries.endMessageId))
    .limit(1)

  return row?.summary ?? null
}

export async function insertSummaryAndMarkMessages(params: {
  conversationId: string
  summary: string
  messageCount: number
  startMessageId: number
  endMessageId: number
  createdAt: number
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(schema.conversationSummaries).values({
      conversationId: params.conversationId,
      summary: params.summary,
      messageCount: params.messageCount,
      startMessageId: params.startMessageId,
      endMessageId: params.endMessageId,
      createdAt: params.createdAt
    })
    await tx
      .update(schema.messages)
      .set({ summarized: true })
      .where(
        and(
          eq(schema.messages.conversationId, params.conversationId),
          gte(schema.messages.id, params.startMessageId),
          lte(schema.messages.id, params.endMessageId)
        )
      )
  })
}

export async function listSummaryRows(conversationId: string): Promise<ConversationSummaryRow[]> {
  return await db
    .select({
      id: schema.conversationSummaries.id,
      summary: schema.conversationSummaries.summary,
      messageCount: schema.conversationSummaries.messageCount,
      startMessageId: schema.conversationSummaries.startMessageId,
      endMessageId: schema.conversationSummaries.endMessageId
    })
    .from(schema.conversationSummaries)
    .where(eq(schema.conversationSummaries.conversationId, conversationId))
    .orderBy(asc(schema.conversationSummaries.endMessageId))
}

export async function replaceSummariesWithCompressed(params: {
  conversationId: string
  summaryIds: number[]
  summary: string
  messageCount: number
  startMessageId: number
  endMessageId: number
  createdAt: number
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.conversationSummaries)
      .where(inArray(schema.conversationSummaries.id, params.summaryIds))
    await tx.insert(schema.conversationSummaries).values({
      conversationId: params.conversationId,
      summary: params.summary,
      messageCount: params.messageCount,
      startMessageId: params.startMessageId,
      endMessageId: params.endMessageId,
      createdAt: params.createdAt
    })
  })
}

export async function getConversationSummaries(
  conversationId: string
): Promise<{ summary: string; message_count: number; created_at: number }[]> {
  const rows = await db
    .select({
      summary: schema.conversationSummaries.summary,
      messageCount: schema.conversationSummaries.messageCount,
      createdAt: schema.conversationSummaries.createdAt
    })
    .from(schema.conversationSummaries)
    .where(eq(schema.conversationSummaries.conversationId, conversationId))
    .orderBy(asc(schema.conversationSummaries.endMessageId))
  return rows.map((row) => ({
    summary: row.summary,
    message_count: row.messageCount,
    created_at: Number(row.createdAt)
  }))
}
