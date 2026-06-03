import { getDatabase } from './database'

import { paginate, type PaginatedResult } from '../lib/pagination'
import { triggerAutoSummary } from './summary-manager'
import crypto from 'crypto'

export interface Chunk {
  pageContent: string
  metadata: Record<string, unknown>
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ===== 用户管理 =====

export function ensureUser(phone: string): number {
  const db = getDatabase()
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as
    | { id: number }
    | undefined
  if (existing) return existing.id

  const now = Date.now()
  const nickname = `user_${phone}`
  const result = db
    .prepare('INSERT INTO users (phone, nickname, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(phone, nickname, now, now)
  return result.lastInsertRowid as number
}

export function recordLogin(userId: number, token: string, ip?: string | null, userAgent?: string) {
  const db = getDatabase()
  const now = Date.now()
  const hashed = crypto.createHash('sha256').update(token).digest('hex')
  db.prepare(
    'INSERT INTO login_history (user_id, token, ip, user_agent, login_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, hashed, ip || null, userAgent || null, now)
  db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(now, userId)
}

export function getUserIdByPhone(phone: string): number | null {
  const db = getDatabase()
  const row = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as
    | { id: number }
    | undefined
  return row ? row.id : null
}

// ===== 会话管理 =====

export function createConversation(id: string, userId: number, initialPrompt?: string) {
  const db = getDatabase()
  const now = Date.now()
  db.prepare(
    'INSERT INTO conversations (id, user_id, initial_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, initialPrompt || null, now, now)
}

export function setInitialPrompt(id: string, prompt: string) {
  const db = getDatabase()
  db.prepare('UPDATE conversations SET initial_prompt = ?, updated_at = ? WHERE id = ?').run(
    prompt,
    Date.now(),
    id
  )
}

export function getInitialPrompt(id: string): string | null {
  const db = getDatabase()
  const row = db.prepare('SELECT initial_prompt FROM conversations WHERE id = ?').get(id) as
    | { initial_prompt: string | null }
    | undefined
  return row?.initial_prompt || null
}

export function updateConversationTitle(id: string, title: string) {
  const db = getDatabase()
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(
    title,
    Date.now(),
    id
  )
}

export function getConversationTitle(id: string): string | null {
  const db = getDatabase()
  const row = db.prepare('SELECT title FROM conversations WHERE id = ?').get(id) as
    | { title: string | null }
    | undefined
  return row?.title || null
}

export function hasMessages(conversationId: string): boolean {
  const db = getDatabase()
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?')
    .get(conversationId) as { cnt: number }
  return row.cnt > 0
}

// ===== 消息管理 =====

export function getConversationChunks(conversationId: string): Chunk[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      'SELECT page_content, metadata FROM chunks WHERE conversation_id = ? AND deleted = 0 ORDER BY chunk_index'
    )
    .all(conversationId) as { page_content: string; metadata: string }[]
  return rows.map((r) => ({
    pageContent: r.page_content,
    metadata: JSON.parse(r.metadata)
  }))
}

export async function buildHistoryPrompt(conversationId: string): Promise<string> {
  const db = getDatabase()

  const summaries = db
    .prepare(
      'SELECT summary FROM conversation_summaries WHERE conversation_id = ? ORDER BY end_message_id ASC'
    )
    .all(conversationId) as { summary: string }[]

  const summaryText =
    summaries.length > 0
      ? '[早期对话摘要]\n' + summaries.map((s) => s.summary).join('\n\n') + '\n\n'
      : ''

  const rows = db
    .prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND summarized = 0 ORDER BY created_at ASC'
    )
    .all(conversationId) as { role: string; content: string }[]
  if (rows.length === 0) return summaryText || ''
  const recentText =
    '[最近对话]\n' +
    rows.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')

  return summaryText + recentText
}

export async function storeMessage(
  conversationId: string,
  role: Message['role'],
  content: string,
  reasoning?: string,
  clientId?: string
) {
  const db = getDatabase()
  if (clientId) {
    db.prepare(
      'INSERT INTO messages (conversation_id, role, content, reasoning, client_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(conversationId, role, content, reasoning || '', clientId, 'completed', Date.now())
  } else {
    db.prepare(
      'INSERT INTO messages (conversation_id, role, content, reasoning, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(conversationId, role, content, reasoning || '', Date.now())
  }
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), conversationId)

  triggerAutoSummary(conversationId).catch((err) =>
    console.error('[summary-manager] trigger error:', err)
  )
}

export function getConversationDocs(conversationId: string): string[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT g.file_path FROM conversation_document_refs r
       JOIN global_documents g ON r.global_doc_id = g.id
       WHERE r.conversation_id = ?`
    )
    .all(conversationId) as { file_path: string }[]
  return rows.map((r) => r.file_path)
}

// ===== Chunks 管理 =====

export function setConversationChunks(conversationId: string, chunks: Chunk[]) {
  const db = getDatabase()
  const now = Date.now()

  db.prepare('DELETE FROM chunks WHERE conversation_id = ?').run(conversationId)

  const stmt = db.prepare(
    'INSERT INTO chunks (conversation_id, page_content, metadata, source, chunk_index, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const insertMany = db.transaction((items: Chunk[]) => {
    for (let i = 0; i < items.length; i++) {
      const chunk = items[i]
      stmt.run(
        conversationId,
        chunk.pageContent,
        JSON.stringify(chunk.metadata || {}),
        (chunk.metadata?.source as string) || '',
        (chunk.metadata?.index as number) || i,
        now
      )
    }
  })
  insertMany(chunks)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)
}

export interface TypedChunk {
  pageContent: string
  metadata: Record<string, unknown>
  docType: 'resume' | 'reference'
  refId?: number
  scope?: string
  refCategory?: string
}

export function setConversationChunksWithTypes(
  conversationId: string,
  chunks: {
    pageContent: string
    metadata: Record<string, unknown>
    docType?: 'resume' | 'reference'
    scope?: string
    refCategory?: string
  }[],
  refId?: number
) {
  const db = getDatabase()
  const now = Date.now()

  db.prepare('DELETE FROM chunks WHERE conversation_id = ?').run(conversationId)

  const stmt = db.prepare(
    'INSERT INTO chunks (conversation_id, page_content, metadata, source, chunk_index, doc_type, ref_id, scope, ref_category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertMany = db.transaction((items: typeof chunks) => {
    for (let i = 0; i < items.length; i++) {
      const chunk = items[i]
      stmt.run(
        conversationId,
        chunk.pageContent,
        JSON.stringify(chunk.metadata || {}),
        (chunk.metadata?.source as string) || '',
        i,
        chunk.docType || 'resume',
        refId || null,
        chunk.scope || 'conversation',
        chunk.refCategory || null,
        now
      )
    }
  })
  insertMany(chunks)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)
}

export function appendConversationChunks(
  conversationId: string,
  chunks: {
    pageContent: string
    metadata: Record<string, unknown>
    docType?: 'resume' | 'reference'
    scope?: string
    refCategory?: string
  }[],
  refId?: number
) {
  const db = getDatabase()
  const now = Date.now()

  const existing = db
    .prepare(
      'SELECT COALESCE(MAX(chunk_index), -1) as maxIdx FROM chunks WHERE conversation_id = ?'
    )
    .get(conversationId) as { maxIdx: number }

  const startIdx = existing.maxIdx + 1

  const stmt = db.prepare(
    'INSERT INTO chunks (conversation_id, page_content, metadata, source, chunk_index, doc_type, ref_id, scope, ref_category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertMany = db.transaction((items: typeof chunks) => {
    for (let i = 0; i < items.length; i++) {
      const chunk = items[i]
      stmt.run(
        conversationId,
        chunk.pageContent,
        JSON.stringify(chunk.metadata || {}),
        (chunk.metadata?.source as string) || '',
        startIdx + i,
        chunk.docType || 'resume',
        refId || null,
        chunk.scope || 'conversation',
        chunk.refCategory || null,
        now
      )
    }
  })
  insertMany(chunks)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)
}

export function deleteChunksByRefId(conversationId: string, refId: number): number {
  const db = getDatabase()
  const result = db
    .prepare(
      'UPDATE chunks SET deleted = 1 WHERE conversation_id = ? AND ref_id = ? AND deleted = 0'
    )
    .run(conversationId, refId)
  return result.changes
}

export function getConversationChunksWithTypes(conversationId: string): TypedChunk[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT page_content, metadata, COALESCE(doc_type, 'resume') as doc_type, ref_id, scope, ref_category
       FROM chunks WHERE conversation_id = ? AND deleted = 0 ORDER BY chunk_index`
    )
    .all(conversationId) as {
    page_content: string
    metadata: string
    doc_type: string
    ref_id: number | null
    scope: string | null
    ref_category: string | null
  }[]
  return rows.map((r) => ({
    pageContent: r.page_content,
    metadata: JSON.parse(r.metadata),
    docType: (r.doc_type as 'resume' | 'reference') || 'resume',
    refId: r.ref_id ?? undefined,
    scope: r.scope ?? undefined,
    refCategory: r.ref_category ?? undefined
  }))
}

export interface Document {
  id: number
  conversation_id: string
  file_path: string
  file_url: string
  original_name: string
  file_type: string
  file_size: number
  created_at: number
  docType: string
}

export interface Conversation {
  id: string
  user_id: number
  title: string | null
  status: string
  created_at: number
  updated_at: number
}

export interface MessageRecord {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  client_id?: string
  status?: string
  created_at: number
}

export interface User {
  id: number
  phone: string
  nickname: string
  created_at: number
  updated_at: number
}

// ===== 历史上下文 =====

export function deleteConversation(conversationId: string): void {
  const db = getDatabase()
  const now = Date.now()
  db.prepare('UPDATE conversations SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
    now,
    now,
    conversationId
  )
  db.prepare(
    `UPDATE global_documents SET reference_count = reference_count - 1
     WHERE id IN (SELECT global_doc_id FROM conversation_document_refs WHERE conversation_id = ?)`
  ).run(conversationId)
  db.prepare(
    'DELETE FROM global_documents WHERE reference_count <= 0 AND id NOT IN (SELECT global_doc_id FROM conversation_document_refs)'
  ).run()
}

export function restoreConversation(conversationId: string): void {
  const db = getDatabase()
  db.prepare('UPDATE conversations SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(
    Date.now(),
    conversationId
  )
}

// ===== API 查询方法 =====

export function getUserByPhone(phone: string): User | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT id, phone, nickname, created_at, updated_at FROM users WHERE phone = ?')
    .get(phone) as User | undefined
  return row || null
}

export function isConversationOwner(conversationId: string, userId: number): boolean {
  const db = getDatabase()
  const row = db
    .prepare(
      'SELECT COUNT(*) as cnt FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    )
    .get(conversationId, userId) as { cnt: number }
  return row.cnt > 0
}

export function getUserConversations(
  userId: number,
  page: number,
  pageSize: number
): PaginatedResult<Conversation> {
  const db = getDatabase()

  return paginate<Conversation>(
    db,
    'SELECT COUNT(*) as cnt FROM conversations WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
    `SELECT id, user_id, title, status, created_at, updated_at
     FROM conversations
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
    [userId],
    page,
    pageSize
  )
}

export function getConversationMessages(
  conversationId: string,
  page: number,
  pageSize: number,
  order: 'ASC' | 'DESC' = 'DESC'
): { data: MessageRecord[]; total: number; initialPrompt: string | null } {
  const db = getDatabase()
  const safeOrder = order === 'ASC' ? 'ASC' : 'DESC'
  const result = paginate<MessageRecord>(
    db,
    'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?',
    [conversationId],
    `SELECT id, conversation_id, role, content, reasoning, client_id, status, created_at
     FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ${safeOrder}
     LIMIT ? OFFSET ?`,
    [conversationId],
    page,
    pageSize
  )

  const convRow = db
    .prepare('SELECT initial_prompt FROM conversations WHERE id = ?')
    .get(conversationId) as { initial_prompt: string | null } | undefined

  return { data: result.data, total: result.total, initialPrompt: convRow?.initial_prompt || null }
}

export function getConversationDocuments(conversationId: string): Document[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT r.id, r.conversation_id, g.file_path,
              '/rag/docs/' || r.id || '/download' as file_url,
              g.file_type, g.file_size, g.original_name, r.created_at,
              r.doc_type as docType
       FROM conversation_document_refs r
       JOIN global_documents g ON r.global_doc_id = g.id
       WHERE r.conversation_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(conversationId, ...[]) as Document[]
}

export { generateConversationSummary, getConversationSummaries } from './summary-manager'
