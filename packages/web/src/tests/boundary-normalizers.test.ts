// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractPartsModifications,
  extractPartsOptimizations,
  normalizeModificationItem,
  normalizeOptimizationItem
} from '../lib/editor-utils'
import { MultipartChatTransport } from '../lib/multipart-chat-transport'

describe('tool output normalizers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes valid optimization and modification items', () => {
    expect(
      normalizeOptimizationItem({
        field: '项目经历',
        current: '负责开发',
        suggestion: '突出指标',
        reason: '更具体',
        priority: '高'
      })
    ).toEqual({
      field: '项目经历',
      current: '负责开发',
      suggestion: '突出指标',
      reason: '更具体',
      priority: '高'
    })

    expect(
      normalizeModificationItem({
        field: '技能',
        current: 'Vue',
        suggestion: 'Vue 3',
        reason: '版本更明确'
      })
    ).toEqual({
      field: '技能',
      current: 'Vue',
      suggestion: 'Vue 3',
      reason: '版本更明确'
    })
  })

  it('filters invalid tool output items', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(normalizeOptimizationItem({ field: '项目', current: 'A', suggestion: 'B' })).toBeNull()
    expect(normalizeModificationItem({ field: '项目', current: '', suggestion: 'B' })).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('extracts only normalized optimization and modification items from tool parts', () => {
    const optimizations = extractPartsOptimizations([
      {
        type: 'tool-optimize',
        output: {
          optimizations: [
            { field: '项目', current: 'A', suggestion: 'B', priority: '中' },
            { field: '项目', current: 'A', suggestion: '', priority: '高' }
          ]
        }
      }
    ])
    const modifications = extractPartsModifications([
      {
        type: 'tool-modify',
        output: {
          modification: { field: '技能', current: 'Vue', suggestion: 'Vue 3' }
        }
      }
    ])

    expect(optimizations).toHaveLength(1)
    expect(optimizations[0].priority).toBe('中')
    expect(modifications).toHaveLength(1)
    expect(modifications[0].suggestion).toBe('Vue 3')
  })
})

describe('MultipartChatTransport body guards', () => {
  it('rejects files that are not File objects', async () => {
    const transport = new MultipartChatTransport({ fetch: vi.fn() })

    await expect(
      transport.sendMessages({
        chatId: 'chat-1',
        messages: [],
        trigger: 'submit-message',
        messageId: undefined,
        abortSignal: undefined,
        body: { files: ['not-file'] } as object
      })
    ).rejects.toThrow('Multipart files must be an array of File objects')
  })

  it('treats non-plain body as an empty JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new ReadableStream(), {
        status: 200,
        statusText: 'OK'
      })
    )
    const transport = new MultipartChatTransport({ fetch: fetchMock })

    await transport.sendMessages({
      chatId: 'chat-1',
      messages: [],
      trigger: 'submit-message',
      messageId: 'msg-1',
      abortSignal: undefined,
      body: ['ignored'] as unknown as object
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chatId: 'chat-1',
          trigger: 'submit-message',
          messageId: 'msg-1'
        })
      })
    )
  })
})
