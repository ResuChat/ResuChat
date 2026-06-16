import { getChatModel } from '../../lib/ai/providers'
import {
  buildConversationMessagesPromptText,
  buildConversationSummaryCompressPrompt,
  buildConversationSummaryPrompt,
  buildIncrementalConversationSummaryPrompt
} from '../../lib/ai/prompts'
import {
  countUnsummarizedMessages,
  getLastSummaryEndMessageId,
  getLatestSummaryText,
  insertSummaryAndMarkMessages,
  listSummaryRows,
  listUnsummarizedMessages,
  replaceSummariesWithCompressed
} from '../../storage/conversation/summary-manager'
import { logger } from '../../lib/logger'
import {
  SUMMARY_TRIGGER_COUNT,
  SUMMARY_BATCH_SIZE,
  SUMMARY_MAX_UNCOMPRESSED
} from '../../lib/config'

const SUMMARY_TRIGGER = SUMMARY_TRIGGER_COUNT
const SUMMARY_BATCH = SUMMARY_BATCH_SIZE
const MAX_UNCOMPRESSED = SUMMARY_MAX_UNCOMPRESSED

export function triggerAutoSummary(conversationId: string): void {
  void runAutoSummary(conversationId).catch((error) =>
    logger.error('Conversation auto summary trigger failed', { conversationId, error })
  )
}

async function runAutoSummary(conversationId: string): Promise<void> {
  const unsummarized = await countUnsummarizedMessages(conversationId)
  if (unsummarized < SUMMARY_TRIGGER) return

  const lastSummaryEndMessageId = await getLastSummaryEndMessageId(conversationId)
  const messages = await listUnsummarizedMessages(conversationId, {
    afterMessageId: lastSummaryEndMessageId ?? undefined,
    limit: SUMMARY_BATCH
  })

  if (messages.length < SUMMARY_BATCH) return

  const conversationText = buildConversationMessagesPromptText(messages)
  const previousSummary = await getLatestSummaryText(conversationId)
  const summaryInput = buildIncrementalConversationSummaryPrompt({
    previousSummary,
    conversationText
  })

  try {
    const response = await getChatModel().invoke([{ role: 'user', content: summaryInput }])
    const summary = typeof response.content === 'string' ? response.content : ''
    const startMessageId = messages[0].id
    const endMessageId = messages[messages.length - 1].id

    await insertSummaryAndMarkMessages({
      conversationId,
      summary: summary.trim(),
      messageCount: messages.length,
      startMessageId,
      endMessageId,
      createdAt: Date.now()
    })

    logger.info('Conversation summary generated', {
      conversationId,
      startMessageId,
      endMessageId,
      messageCount: messages.length
    })

    await compressSummaries(conversationId)
  } catch (error) {
    logger.error('Conversation summary generation failed', { conversationId, error })
  }
}

async function compressSummaries(conversationId: string): Promise<void> {
  const summaries = await listSummaryRows(conversationId)
  if (summaries.length <= MAX_UNCOMPRESSED) return

  const toCompress = summaries.slice(0, summaries.length - MAX_UNCOMPRESSED)
  const combinedText = toCompress.map((summary) => summary.summary).join('\n\n')

  try {
    let compressed: string

    if (toCompress.length === 1) {
      compressed = stripTodoSection(toCompress[0].summary)
    } else {
      const response = await getChatModel().invoke([
        { role: 'user', content: await buildConversationSummaryCompressPrompt(combinedText) }
      ])
      compressed = typeof response.content === 'string' ? response.content : ''
    }

    await replaceSummariesWithCompressed({
      conversationId,
      summaryIds: toCompress.map((summary) => summary.id),
      summary: compressed.trim(),
      messageCount: toCompress.reduce((sum, summary) => sum + summary.messageCount, 0),
      startMessageId: toCompress[0].startMessageId,
      endMessageId: toCompress[toCompress.length - 1].endMessageId,
      createdAt: Date.now()
    })

    logger.info('Conversation summaries compressed', {
      conversationId,
      compressedCount: toCompress.length
    })
  } catch (error) {
    logger.error('Conversation summary compression failed', { conversationId, error })
  }
}

export async function generateConversationSummary(conversationId: string): Promise<string> {
  const messages = await listUnsummarizedMessages(conversationId)
  if (messages.length === 0) {
    return 'No unsummarized messages'
  }

  const conversationText = buildConversationMessagesPromptText(messages)
  const response = await getChatModel().invoke([
    { role: 'user', content: await buildConversationSummaryPrompt(conversationText) }
  ])
  const summary = typeof response.content === 'string' ? response.content : ''
  const startMessageId = messages[0].id
  const endMessageId = messages[messages.length - 1].id

  await insertSummaryAndMarkMessages({
    conversationId,
    summary: summary.trim(),
    messageCount: messages.length,
    startMessageId,
    endMessageId,
    createdAt: Date.now()
  })

  return summary.trim()
}

function stripTodoSection(text: string): string {
  const lines = text.split('\n')
  const index = lines.findIndex((line) => /^(待办事项|待办[：:]|-\s*\[[ xX]\])/.test(line.trim()))
  if (index !== -1) {
    return lines.slice(0, index).join('\n').trim()
  }
  return text.trim()
}
