import type { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import {
  getMessageStatusByClientId,
  insertMessageWithClientId,
  storeMessage,
  touchConversation,
  updateMessageByClientId
} from '../../storage/document/messages'
import { db, schema } from '../../lib/db'
import { logger } from '../../lib/logger'
import { triggerAutoSummary } from './summary.service'
import type { MessageAttachment } from '../../types/domain'

export type SearchStreamState = 'streaming' | 'interrupted' | 'completed'

export interface SearchStreamRuntime {
  abortController: AbortController
  isAborted: boolean
  streamFullyConsumed: boolean
  responseFinished: boolean
  abortStream: () => void
  markConsumed: () => void
  markResponseFinished: () => void
}

export function createSearchStreamRuntime(): SearchStreamRuntime {
  const abortController = new AbortController()

  return {
    abortController,
    isAborted: false,
    streamFullyConsumed: false,
    responseFinished: false,
    abortStream() {
      if (this.isAborted) return
      this.isAborted = true
      abortController.abort()
    },
    markConsumed() {
      this.streamFullyConsumed = true
    },
    markResponseFinished() {
      this.responseFinished = true
    }
  }
}

export class SearchStreamPersistence {
  readonly runtime: SearchStreamRuntime
  readonly assistantMessageId: string | null
  private readonly conversationId: string
  private content = ''
  private reasoning = ''

  private constructor(params: {
    runtime: SearchStreamRuntime
    conversationId: string
    assistantMessageId: string | null
  }) {
    this.runtime = params.runtime
    this.conversationId = params.conversationId
    this.assistantMessageId = params.assistantMessageId
  }

  static async create(params: {
    conversationId: string
    query: string
    displayText?: string
    attachments?: MessageAttachment[]
    userMsgId?: string
    assistantMsgId: string
  }) {
    const runtime = createSearchStreamRuntime()
    const assistantMessageId = await persistSearchMessages({
      conversationId: params.conversationId,
      query: params.query,
      displayText: params.displayText,
      attachments: params.attachments,
      userMsgId: params.userMsgId,
      assistantMsgId: params.assistantMsgId
    })

    return new SearchStreamPersistence({
      runtime,
      conversationId: params.conversationId,
      assistantMessageId
    })
  }

  get abortSignal() {
    return this.runtime.abortController.signal
  }

  get isAborted() {
    return this.runtime.isAborted
  }

  appendText(delta: string) {
    this.content += delta
  }

  appendReasoning(delta: string) {
    this.reasoning += delta
  }

  markConsumed() {
    this.runtime.markConsumed()
  }

  attachAbortHandlers(req: Request, res: Response) {
    req.on('aborted', () => {
      this.runtime.abortStream()
    })

    res.on('finish', () => {
      this.runtime.markResponseFinished()
    })

    res.on('close', () => {
      if (this.runtime.responseFinished || res.writableFinished) return
      this.runtime.abortStream()
      void this.handleDisconnect()
    })
  }

  async persistBoundary() {
    if (!this.assistantMessageId) return

    await updateMessageByClientId(
      this.assistantMessageId,
      this.content,
      this.reasoning,
      this.currentState() === 'interrupted' ? 'interrupted' : 'streaming'
    )
  }

  async finalize() {
    if (!this.assistantMessageId) return

    const state = this.currentState()
    await updateMessageByClientId(this.assistantMessageId, this.content, this.reasoning, state)
    if (state === 'completed') triggerAutoSummary(this.conversationId)
  }

  private currentState(): SearchStreamState {
    return this.runtime.isAborted
      ? 'interrupted'
      : this.runtime.streamFullyConsumed
        ? 'completed'
        : 'streaming'
  }

  private async handleDisconnect() {
    if (!this.assistantMessageId || this.runtime.streamFullyConsumed) return

    try {
      const row = await getMessageStatusByClientId(this.assistantMessageId)
      if (!row || row.status !== 'streaming') return

      await updateMessageByClientId(
        this.assistantMessageId,
        this.content || row.content,
        this.reasoning || row.reasoning,
        'interrupted'
      )
    } catch (error) {
      logger.error('Failed to mark streaming message interrupted', {
        assistantMessageId: this.assistantMessageId,
        error
      })
    }
  }
}

export async function persistSearchMessages(params: {
  conversationId: string
  query: string
  displayText?: string
  attachments?: MessageAttachment[]
  userMsgId?: string
  assistantMsgId: string
}) {
  const { conversationId, query, displayText, attachments, userMsgId, assistantMsgId } = params

  if (userMsgId) {
    await insertMessageWithClientId(
      conversationId,
      'user',
      query,
      userMsgId,
      'completed',
      undefined,
      displayText,
      attachments
    )
  } else {
    await storeMessage(
      conversationId,
      'user',
      query,
      undefined,
      undefined,
      displayText,
      attachments
    )
  }

  await insertMessageWithClientId(conversationId, 'assistant', '', assistantMsgId, 'streaming')

  await touchConversation(conversationId)
  return assistantMsgId
}

export async function resetStuckStreamingMessages(): Promise<number> {
  const result = await db
    .update(schema.messages)
    .set({ status: 'interrupted' })
    .where(eq(schema.messages.status, 'streaming'))
    .returning({ id: schema.messages.id })
  return result.length
}
