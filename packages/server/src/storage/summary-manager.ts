import { PromptTemplate } from '@langchain/core/prompts'

import { getDatabase } from './database'
import { getChatModel } from '../lib/providers'

const SUMMARY_TRIGGER = 60
const SUMMARY_BATCH = 40
const MAX_UNCOMPRESSED = 5

const summaryTemplate = new PromptTemplate({
  template: `请总结以下对话内容，提取关键信息和用户需求。保持简洁（400字以内）。\n最后用 - [ ] 格式列出当前的待办事项（未完成的修改、待确认的建议等）。如无待办则写"无待办"。\n\n{text}`,
  inputVariables: ['text']
})

const compressTemplate = new PromptTemplate({
  template: `以下是一段对话的多段摘要，请合并压缩为一段连贯的摘要（600字以内）。\n必须保留：用户的初始意图 / 核心目标、已完成的修改项、关键决策。\n其他过程性细节可适当精简。\n\n{text}`,
  inputVariables: ['text']
})

export async function triggerAutoSummary(conversationId: string): Promise<void> {
  const db = getDatabase()

  const unsummarized = db
    .prepare('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND summarized = 0')
    .get(conversationId) as { cnt: number }

  if (unsummarized.cnt < SUMMARY_TRIGGER) return

  const lastSummary = db
    .prepare(
      'SELECT end_message_id FROM conversation_summaries WHERE conversation_id = ? ORDER BY end_message_id DESC LIMIT 1'
    )
    .get(conversationId) as { end_message_id: number } | undefined

  const messages = db
    .prepare(
      `SELECT id, role, content FROM messages
       WHERE conversation_id = ? AND summarized = 0 AND (? IS NULL OR id > ?)
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(
      conversationId,
      lastSummary?.end_message_id || null,
      lastSummary?.end_message_id || null,
      SUMMARY_BATCH
    ) as { id: number; role: string; content: string }[]

  if (messages.length < SUMMARY_BATCH) return

  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const prevSummaryRow = db
    .prepare(
      'SELECT summary FROM conversation_summaries WHERE conversation_id = ? ORDER BY end_message_id DESC LIMIT 1'
    )
    .get(conversationId) as { summary: string } | undefined

  const summaryInput = prevSummaryRow
    ? `上一段摘要：${prevSummaryRow.summary}\n\n新对话内容：\n${conversationText}\n\n请结合上一段摘要，总结新对话内容中新增的关键信息和用户需求。保持简洁（400字以内）。\n最后用 - [ ] 格式列出当前的待办事项（未完成的修改、待确认的建议等）。如无待办则写"无待办"。`
    : `请总结以下对话内容，提取关键信息和用户需求。保持简洁（400字以内）。\n最后用 - [ ] 格式列出当前的待办事项（未完成的修改、待确认的建议等）。如无待办则写"无待办"。\n\n${conversationText}`

  try {
    const response = await getChatModel().invoke([{ role: 'user', content: summaryInput }])
    const summary = typeof response.content === 'string' ? response.content : ''

    const startId = messages[0].id
    const endId = messages[messages.length - 1].id

    db.prepare(
      `INSERT INTO conversation_summaries (conversation_id, summary, message_count, start_message_id, end_message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(conversationId, summary.trim(), messages.length, startId, endId, Date.now())

    db.prepare(
      'UPDATE messages SET summarized = 1 WHERE conversation_id = ? AND id BETWEEN ? AND ?'
    ).run(conversationId, startId, endId)

    console.log(
      `[summary-manager] Generated summary for conversation ${conversationId}, messages ${startId}-${endId}`
    )

    await compressSummaries(conversationId)
  } catch (error) {
    console.error('[summary-manager] Failed to generate summary:', error)
  }
}

async function compressSummaries(conversationId: string): Promise<void> {
  const db = getDatabase()

  const summaries = db
    .prepare(
      `SELECT id, summary, message_count, start_message_id, end_message_id
       FROM conversation_summaries
       WHERE conversation_id = ?
       ORDER BY end_message_id ASC`
    )
    .all(conversationId) as {
    id: number
    summary: string
    message_count: number
    start_message_id: number
    end_message_id: number
  }[]

  if (summaries.length <= MAX_UNCOMPRESSED) return

  const toCompress = summaries.slice(0, summaries.length - MAX_UNCOMPRESSED)
  const combinedText = toCompress.map((s) => s.summary).join('\n\n')

  try {
    let compressed: string

    if (toCompress.length === 1) {
      // 仅 1 段 → 跳过 LLM 压缩，直接 strip 待办后作为纯背景
      compressed = stripTodoSection(toCompress[0].summary)
    } else {
      const response = await getChatModel().invoke([
        { role: 'user', content: await compressTemplate.format({ text: combinedText }) }
      ])
      compressed = typeof response.content === 'string' ? response.content : ''
    }

    const transaction = db.transaction((txnDb: any) => {
      for (const s of toCompress) {
        txnDb.prepare('DELETE FROM conversation_summaries WHERE id = ?').run(s.id)
      }
      txnDb
        .prepare(
          `INSERT INTO conversation_summaries (conversation_id, summary, message_count, start_message_id, end_message_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          conversationId,
          compressed.trim(),
          toCompress.reduce((sum, s) => sum + s.message_count, 0),
          toCompress[0].start_message_id,
          toCompress[toCompress.length - 1].end_message_id,
          Date.now()
        )
    })

    transaction(db)
    console.log(
      `[summary-manager] Compressed ${toCompress.length} summaries for conversation ${conversationId}`
    )
  } catch (error) {
    console.error('[summary-manager] Failed to compress summaries:', error)
  }
}

export async function generateConversationSummary(conversationId: string): Promise<string> {
  const db = getDatabase()

  const messages = db
    .prepare(
      'SELECT id, role, content FROM messages WHERE conversation_id = ? AND summarized = 0 ORDER BY created_at ASC'
    )
    .all(conversationId) as { id: number; role: string; content: string }[]

  if (messages.length === 0) {
    return 'No unsummarized messages'
  }

  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const response = await getChatModel().invoke([
    { role: 'user', content: await summaryTemplate.format({ text: conversationText }) }
  ])
  const summary = typeof response.content === 'string' ? response.content : ''

  const startId = messages[0].id
  const endId = messages[messages.length - 1].id

  db.prepare(
    `INSERT INTO conversation_summaries (conversation_id, summary, message_count, start_message_id, end_message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(conversationId, summary.trim(), messages.length, startId, endId, Date.now())

  db.prepare(
    'UPDATE messages SET summarized = 1 WHERE conversation_id = ? AND id BETWEEN ? AND ?'
  ).run(conversationId, startId, endId)

  return summary.trim()
}

export async function getConversationSummaries(
  conversationId: string
): Promise<{ summary: string; message_count: number; created_at: number }[]> {
  const db = getDatabase()
  return db
    .prepare(
      'SELECT summary, message_count, created_at FROM conversation_summaries WHERE conversation_id = ? ORDER BY end_message_id ASC'
    )
    .all(conversationId) as { summary: string; message_count: number; created_at: number }[]
}

function stripTodoSection(text: string): string {
  const match = text.match(/\n待办事项|\n- \[ \]|待办：|待办:/)
  return match ? text.substring(0, match.index).trim() : text.trim()
}
