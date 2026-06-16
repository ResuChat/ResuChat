import { EventEmitter } from 'events'
import { describe, expect, it } from 'vitest'
import { SearchStreamPersistence } from '../src/services/chat/stream-persistence.service'
import {
  getMessageStatusByClientId,
  insertMessageWithClientId,
  updateMessageByClientId
} from '../src/storage/document/messages'
import { createConversation } from '../src/storage/repository'
import { getApiTestState, registerApiTestLifecycle } from './helpers/api-test-helper'

registerApiTestLifecycle()

describe('Streaming message persistence', () => {
  it('should preserve buffered content when marking interrupted', async () => {
    const convId = `conv_interrupt_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    await insertMessageWithClientId(convId, 'assistant', '', 'client-interrupt-test', 'streaming')
    await updateMessageByClientId('client-interrupt-test', '已生成预览', 'reasoning', 'streaming')

    const row = await getMessageStatusByClientId('client-interrupt-test')
    expect(row).toBeDefined()
    expect(row?.status).toBe('streaming')
    expect(row?.content).toBe('已生成预览')
    expect(row?.reasoning).toBe('reasoning')
  })

  it('should finalize streaming message as completed after consume finishes', async () => {
    const convId = `conv_stream_complete_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    const persistence = await SearchStreamPersistence.create({
      conversationId: convId,
      query: '测试',
      assistantMsgId: 'client-stream-complete'
    })
    persistence.appendText('完成内容')
    persistence.appendReasoning('完成推理')
    persistence.markConsumed()
    await persistence.finalize()

    const row = await getMessageStatusByClientId('client-stream-complete')
    expect(row).toBeDefined()
    expect(row?.status).toBe('completed')
    expect(row?.content).toBe('完成内容')
    expect(row?.reasoning).toBe('完成推理')
  })

  it('should finalize streaming message as interrupted after abort', async () => {
    const convId = `conv_stream_interrupt_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    const persistence = await SearchStreamPersistence.create({
      conversationId: convId,
      query: '测试',
      assistantMsgId: 'client-stream-interrupt'
    })
    persistence.appendText('中断内容')
    persistence.appendReasoning('中断推理')
    persistence.runtime.abortStream()
    await persistence.finalize()

    const row = await getMessageStatusByClientId('client-stream-interrupt')
    expect(row).toBeDefined()
    expect(row?.status).toBe('interrupted')
    expect(row?.content).toBe('中断内容')
    expect(row?.reasoning).toBe('中断推理')
  })

  it('should persist partial content as interrupted on response close', async () => {
    const convId = `conv_stream_close_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    const persistence = await SearchStreamPersistence.create({
      conversationId: convId,
      query: '测试',
      assistantMsgId: 'client-stream-close'
    })

    const req = new EventEmitter()
    const res = new EventEmitter()
    persistence.attachAbortHandlers(req as never, res as never)
    persistence.appendText('已累计的内容')
    persistence.appendReasoning('已累计的推理')

    res.emit('close')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const row = await getMessageStatusByClientId('client-stream-close')
    expect(row).toBeDefined()
    expect(row?.status).toBe('interrupted')
    expect(row?.content).toBe('已累计的内容')
    expect(row?.reasoning).toBe('已累计的推理')
  })

  it('should keep completed status when close happens after finish', async () => {
    const convId = `conv_stream_finish_then_close_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    const persistence = await SearchStreamPersistence.create({
      conversationId: convId,
      query: '测试',
      assistantMsgId: 'client-stream-finish-close'
    })

    const req = new EventEmitter()
    const res = new EventEmitter() as EventEmitter & { writableFinished?: boolean }
    persistence.attachAbortHandlers(req as never, res as never)
    persistence.appendText('完整内容')
    persistence.appendReasoning('完整推理')
    persistence.markConsumed()
    await persistence.finalize()

    res.writableFinished = true
    res.emit('finish')
    res.emit('close')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const row = await getMessageStatusByClientId('client-stream-finish-close')
    expect(row).toBeDefined()
    expect(row?.status).toBe('completed')
    expect(row?.content).toBe('完整内容')
    expect(row?.reasoning).toBe('完整推理')
  })
})
