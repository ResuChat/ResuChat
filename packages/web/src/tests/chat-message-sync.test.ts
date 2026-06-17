import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { getSdkMessageSignature, syncSdkMessageToStore } from '../lib/chat-message-sync'
import type { Message } from '../types/chat'

describe('chat-message-sync', () => {
  it('changes signature when text or reasoning changes', () => {
    const base = makeMessage([
      { type: 'text', text: 'hello' },
      { type: 'reasoning', text: 'r1' }
    ])
    const textChanged = makeMessage([
      { type: 'text', text: 'hello world' },
      { type: 'reasoning', text: 'r1' }
    ])
    const reasoningChanged = makeMessage([
      { type: 'text', text: 'hello' },
      { type: 'reasoning', text: 'reasoning changed' }
    ])

    expect(getSdkMessageSignature(textChanged)).not.toBe(getSdkMessageSignature(base))
    expect(getSdkMessageSignature(reasoningChanged)).not.toBe(getSdkMessageSignature(base))
  })

  it('changes signature when tool state or output length changes', () => {
    const pending = makeMessage([
      { type: 'tool-optimize', state: 'input-streaming', toolCallId: 'tool-1' }
    ])
    const ready = makeMessage([
      {
        type: 'tool-optimize',
        state: 'output-available',
        toolCallId: 'tool-1',
        output: { optimization: { field: '项目', current: 'A', suggestion: 'B' } }
      }
    ])
    const largerOutput = makeMessage([
      {
        type: 'tool-optimize',
        state: 'output-available',
        toolCallId: 'tool-1',
        output: { optimization: { field: '项目', current: 'A', suggestion: '更长的建议内容' } }
      }
    ])

    expect(getSdkMessageSignature(ready)).not.toBe(getSdkMessageSignature(pending))
    expect(getSdkMessageSignature(largerOutput)).not.toBe(getSdkMessageSignature(ready))
  })

  it('syncs sdk message content and keeps reasoning visibility state', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'old',
        reasoning: '',
        showReasoning: false,
        optimizations: []
      }
    ]
    const showReasoningMap = new Map([['m1', true]])

    const changed = syncSdkMessageToStore(
      messages,
      makeMessage([
        { type: 'text', text: 'new content' },
        { type: 'reasoning', text: 'new reasoning' }
      ]),
      showReasoningMap
    )

    expect(changed).toBe(true)
    expect(messages[0]).toMatchObject({
      content: 'new content',
      reasoning: 'new reasoning',
      showReasoning: false
    })
  })

  it('skips assistant messages that only contain tool parts without output cards', () => {
    const messages: Message[] = []
    const changed = syncSdkMessageToStore(
      messages,
      makeMessage([{ type: 'tool-optimize', state: 'input-streaming', toolCallId: 'tool-1' }]),
      new Map()
    )

    expect(changed).toBe(false)
    expect(messages).toEqual([])
  })
})

function makeMessage(parts: unknown[]): UIMessage {
  return {
    id: 'm1',
    role: 'assistant',
    parts
  } as UIMessage
}
