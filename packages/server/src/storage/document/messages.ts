import { and, asc, count, desc, eq, lt } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import type { MessageAttachment, MessageRecord } from '../../types/domain'

export type { MessageRecord } from '../../types/domain'

export async function buildHistoryPrompt(conversationId: string): Promise<string> {
  const summaries = await db
    .select({ summary: schema.conversationSummaries.summary })
    .from(schema.conversationSummaries)
    .where(eq(schema.conversationSummaries.conversationId, conversationId))
    .orderBy(asc(schema.conversationSummaries.endMessageId))

  const summaryText =
    summaries.length > 0
      ? '[早期对话摘要]\n' + summaries.map((s) => s.summary).join('\n\n') + '\n\n'
      : ''

  const rows = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(
      and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.summarized, false))
    )
    .orderBy(asc(schema.messages.createdAt))

  if (rows.length === 0) return summaryText || ''
  const recentText =
    '[最近对话]\n' +
    rows.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')

  return summaryText + recentText
}

export async function getRecentConversationContextMessages(
  conversationId: string,
  limit = 4
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await db
    .select({
      role: schema.messages.role,
      content: schema.messages.content,
      displayContent: schema.messages.displayContent
    })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(limit)

  return rows
    .reverse()
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.displayContent || row.content
    }))
    .filter((row) => row.content.trim().length > 0)
}

export async function storeMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  reasoning?: string,
  clientId?: string,
  displayContent?: string,
  attachments?: MessageAttachment[]
) {
  const now = Date.now()
  await db.insert(schema.messages).values({
    conversationId,
    role,
    content,
    reasoning: reasoning || '',
    clientId: clientId || null,
    status: 'completed',
    displayContent: displayContent || null,
    attachments: attachments?.length ? attachments : null,
    createdAt: now
  })
  await db
    .update(schema.conversations)
    .set({ updatedAt: now })
    .where(eq(schema.conversations.id, conversationId))
}

export async function getConversationMessages(
  conversationId: string,
  page: number,
  pageSize: number,
  order: 'ASC' | 'DESC' = 'DESC'
): Promise<{ data: MessageRecord[]; total: number; initialPrompt: string | null }> {
  const where = eq(schema.messages.conversationId, conversationId)
  const orderBy =
    order === 'ASC'
      ? [asc(schema.messages.createdAt), asc(schema.messages.id)]
      : [desc(schema.messages.createdAt), desc(schema.messages.id)]

  const [total, data, convRow] = await Promise.all([
    db.select({ value: count() }).from(schema.messages).where(where),
    db
      .select()
      .from(schema.messages)
      .where(where)
      .orderBy(...orderBy)
      .offset((page - 1) * pageSize)
      .limit(pageSize),
    db
      .select({ initialPrompt: schema.conversations.initialPrompt })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1)
  ])

  return {
    data: data.map(mapMessageRecord),
    total: total[0]?.value ?? 0,
    initialPrompt: convRow[0]?.initialPrompt ?? null
  }
}

/** 游标分页：获取指定消息之前的消息（按 client_id 游标） */
export async function getMessagesBefore(
  conversationId: string,
  beforeClientId: string,
  limit: number
): Promise<{ data: MessageRecord[]; total: number; nextCursor: string | null }> {
  const [total, cursorRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId)),
    db
      .select({ createdAt: schema.messages.createdAt })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.clientId, beforeClientId),
          eq(schema.messages.conversationId, conversationId)
        )
      )
      .limit(1)
  ])

  const cursor = cursorRow[0]
  const totalCount = total[0]?.value ?? 0
  if (!cursor) {
    return { data: [], total: totalCount, nextCursor: null }
  }

  const data = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        lt(schema.messages.createdAt, cursor.createdAt)
      )
    )
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(limit)

  const nextCursor = data.length === limit ? (data[data.length - 1]?.clientId ?? null) : null

  return { data: data.map(mapMessageRecord), total: totalCount, nextCursor }
}

/** 通过 client_id 插入消息（用于流式消息预注册） */
export async function insertMessageWithClientId(
  conversationId: string,
  role: string,
  content: string,
  clientId: string,
  status: string,
  reasoning?: string,
  displayContent?: string,
  attachments?: MessageAttachment[]
): Promise<void> {
  await db.insert(schema.messages).values({
    conversationId,
    role: role as 'user' | 'assistant',
    content,
    reasoning: reasoning || '',
    clientId,
    status,
    displayContent: displayContent || null,
    attachments: attachments?.length ? attachments : null,
    createdAt: Date.now()
  })
}

/** 通过 client_id 更新消息内容和状态 */
export async function updateMessageByClientId(
  clientId: string,
  content: string,
  reasoning: string,
  status: string
): Promise<void> {
  await db
    .update(schema.messages)
    .set({ content, reasoning, status })
    .where(eq(schema.messages.clientId, clientId))
}

/** 通过 client_id 获取消息状态 */
export async function getMessageStatusByClientId(
  clientId: string
): Promise<{ status: string; content: string; reasoning: string } | undefined> {
  const [row] = await db
    .select({
      status: schema.messages.status,
      content: schema.messages.content,
      reasoning: schema.messages.reasoning
    })
    .from(schema.messages)
    .where(eq(schema.messages.clientId, clientId))
    .limit(1)
  return row ? { status: row.status, content: row.content, reasoning: row.reasoning } : undefined
}

/** 更新会话的 updated_at 时间戳 */
export async function touchConversation(conversationId: string): Promise<void> {
  await db
    .update(schema.conversations)
    .set({ updatedAt: Date.now() })
    .where(eq(schema.conversations.id, conversationId))
}

// Drizzle row -> 旧 MessageRecord 映射
function mapMessageRecord(m: {
  id: number
  conversationId: string
  role: string
  content: string
  reasoning: string
  clientId: string | null
  status: string
  displayContent: string | null
  attachments: unknown
  createdAt: number
}): MessageRecord {
  return {
    id: m.id,
    conversation_id: m.conversationId,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    reasoning: m.reasoning,
    client_id: m.clientId ?? undefined,
    status: m.status,
    display_content: m.displayContent ?? undefined,
    attachments: normalizeMessageAttachments(m.attachments),
    created_at: Number(m.createdAt)
  }
}

function normalizeMessageAttachments(value: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined

  const attachments = value.flatMap((item): MessageAttachment[] => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    if (raw.type !== 'reference') return []
    if (raw.source !== 'upload' && raw.source !== 'library') return []
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return []

    return [
      {
        type: 'reference',
        source: raw.source,
        name: raw.name,
        refId: optionalPositiveInteger(raw.refId),
        globalDocId: optionalPositiveInteger(raw.globalDocId),
        docId: optionalPositiveInteger(raw.docId),
        fileType: typeof raw.fileType === 'string' ? raw.fileType : undefined,
        fileSize: optionalNonNegativeInteger(raw.fileSize),
        category: typeof raw.category === 'string' ? raw.category : undefined
      }
    ]
  })

  return attachments.length > 0 ? attachments : undefined
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : undefined
}
