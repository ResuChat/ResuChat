import { describe, expect, it } from 'vitest'
import type { SearchStreamPersistence } from '../src/services/chat/stream-persistence.service'
import {
  consumeSearchSseStream,
  executeSearchStream
} from '../src/services/chat/search-execution.service'

type StreamPersistenceStub = Pick<
  SearchStreamPersistence,
  | 'isAborted'
  | 'abortSignal'
  | 'appendText'
  | 'appendReasoning'
  | 'persistBoundary'
  | 'markConsumed'
  | 'finalize'
>

function createSseStream(lines: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    }
  })
}

describe('consumeSearchSseStream', () => {
  it('should collect tool-only/text delta stream and finalize completed', async () => {
    const persisted: Array<{ kind: string; content?: string; reasoning?: string }> = []
    const streamPersistence: StreamPersistenceStub = {
      abortSignal: new AbortController().signal,
      isAborted: false,
      appendText(delta: string) {
        persisted.push({ kind: 'text-delta', content: delta })
      },
      appendReasoning(delta: string) {
        persisted.push({ kind: 'reasoning-delta', reasoning: delta })
      },
      async persistBoundary() {
        persisted.push({ kind: 'boundary' })
      },
      markConsumed() {
        persisted.push({ kind: 'consumed' })
      },
      async finalize() {
        persisted.push({ kind: 'finalize' })
      }
    }

    await consumeSearchSseStream({
      stream: createSseStream([
        'data: {"type":"text-delta","delta":"已生成预览"}\n',
        'data: {"type":"text-end"}\n'
      ]),
      streamPersistence: streamPersistence as SearchStreamPersistence
    })

    expect(
      persisted.some((entry) => entry.kind === 'text-delta' && entry.content === '已生成预览')
    ).toBe(true)
    expect(persisted.some((entry) => entry.kind === 'boundary')).toBe(true)
    expect(persisted[persisted.length - 1]?.kind).toBe('finalize')
  })

  it('should finalize tool-only stream even when there is no text delta', async () => {
    const persisted: string[] = []
    const streamPersistence: StreamPersistenceStub = {
      abortSignal: new AbortController().signal,
      isAborted: false,
      appendText() {
        persisted.push('text')
      },
      appendReasoning() {
        persisted.push('reasoning')
      },
      async persistBoundary() {
        persisted.push('boundary')
      },
      markConsumed() {
        persisted.push('consumed')
      },
      async finalize() {
        persisted.push('finalize')
      }
    }

    await consumeSearchSseStream({
      stream: createSseStream([
        'data: {"type":"tool-output-available","toolName":"updateResume"}\n'
      ]),
      streamPersistence: streamPersistence as SearchStreamPersistence
    })

    expect(persisted).toContain('consumed')
    expect(persisted).toContain('finalize')
    expect(persisted).not.toContain('text')
  })

  it('should stop consuming additional chunks after abort', async () => {
    const persisted: string[] = []
    const streamPersistence: StreamPersistenceStub = {
      abortSignal: new AbortController().signal,
      isAborted: false,
      appendText(delta: string) {
        persisted.push(delta)
        this.isAborted = true
      },
      appendReasoning() {
        /* noop */
      },
      async persistBoundary() {
        persisted.push('boundary')
      },
      markConsumed() {
        persisted.push('consumed')
      },
      async finalize() {
        persisted.push('finalize')
      }
    }

    await consumeSearchSseStream({
      stream: createSseStream([
        'data: {"type":"text-delta","delta":"第一段"}\n',
        'data: {"type":"text-delta","delta":"第二段"}\n'
      ]),
      streamPersistence: streamPersistence as SearchStreamPersistence
    })

    expect(persisted).toContain('第一段')
    expect(persisted).not.toContain('第二段')
    expect(persisted[persisted.length - 1]).toBe('finalize')
  })
})

describe('executeSearchStream', () => {
  it('should pass assistantMsgId into generateMessageId', async () => {
    const persisted: string[] = []
    const streamPersistence: StreamPersistenceStub = {
      abortSignal: new AbortController().signal,
      isAborted: false,
      markConsumed() {
        persisted.push('consumed')
      },
      appendText() {
        /* noop */
      },
      appendReasoning() {
        /* noop */
      },
      async persistBoundary() {
        persisted.push('boundary')
      },
      async finalize() {
        persisted.push('finalize')
      }
    }

    let generatedId = ''
    let drainPromise: Promise<void> | undefined

    executeSearchStream({
      res: {} as never,
      assistantMsgId: 'assistant-id-123',
      tools: {},
      prompt: 'test',
      streamPersistence: streamPersistence as SearchStreamPersistence,
      createUIStream: () => ({
        pipeUIMessageStreamToResponse(_res, options) {
          generatedId = options.generateMessageId?.() || ''
          drainPromise = options.consumeSseStream({
            stream: createSseStream(['data: {"type":"text-end"}\n'])
          })
        }
      })
    })

    await drainPromise
    expect(generatedId).toBe('assistant-id-123')
    expect(persisted).toContain('boundary')
    expect(persisted).toContain('finalize')
  })
})
