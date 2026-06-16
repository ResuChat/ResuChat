import type { Response } from 'express'
import { streamText, stepCountIs, type ToolSet } from 'ai'
import { deepseek, DEFAULT_MODEL } from '../../lib/ai/providers'
import { SearchStreamPersistence } from './stream-persistence.service'
import { logger } from '../../lib/logger'
import { AI_MAX_STEPS, LLM_RETRIES } from '../../lib/config'

interface UIStreamResult {
  pipeUIMessageStreamToResponse: (
    res: Response,
    options: {
      generateMessageId?: () => string
      consumeSseStream: (args: { stream: ReadableStream<Uint8Array | string> }) => Promise<void>
    }
  ) => void
}

type CreateUIStream = (params: {
  tools: ToolSet
  prompt: string
  abortSignal: AbortSignal
}) => UIStreamResult

function defaultCreateUIStream(params: {
  tools: ToolSet
  prompt: string
  abortSignal: AbortSignal
}): UIStreamResult {
  return streamText({
    model: deepseek(DEFAULT_MODEL),
    tools: params.tools,
    stopWhen: stepCountIs(AI_MAX_STEPS),
    maxRetries: LLM_RETRIES,
    prompt: params.prompt,
    abortSignal: params.abortSignal
  })
}

export async function consumeSearchSseStream(params: {
  stream: ReadableStream<Uint8Array | string>
  streamPersistence: SearchStreamPersistence
}) {
  const { stream, streamPersistence } = params
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        streamPersistence.markConsumed()
        break
      }
      if (streamPersistence.isAborted) break

      const text = typeof value === 'string' ? value : decoder.decode(value, { stream: true })
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'text-delta') {
            streamPersistence.appendText(data.delta)
          } else if (data.type === 'reasoning-delta') {
            streamPersistence.appendReasoning(data.delta)
          } else if (data.type === 'text-end' || data.type === 'reasoning-end') {
            await streamPersistence.persistBoundary()
          }
        } catch {
          /* non-JSON SSE lines (event:, empty, partial) are expected */
        }
      }
    }
  } finally {
    await streamPersistence.finalize()
  }
}

export function executeSearchStream(params: {
  res: Response
  assistantMsgId?: string
  tools: ToolSet
  prompt: string
  streamPersistence: SearchStreamPersistence
  createUIStream?: CreateUIStream
}) {
  const {
    res,
    assistantMsgId,
    tools,
    prompt,
    streamPersistence,
    createUIStream = defaultCreateUIStream
  } = params

  const result = createUIStream({
    tools,
    prompt,
    abortSignal: streamPersistence.abortSignal
  })

  result.pipeUIMessageStreamToResponse(res, {
    ...(assistantMsgId ? { generateMessageId: () => assistantMsgId } : {}),
    consumeSseStream: async ({ stream }) => {
      try {
        await consumeSearchSseStream({ stream, streamPersistence })
      } catch (error) {
        logger.error('Search SSE stream consumption failed', { error })
      }
    }
  })
}
