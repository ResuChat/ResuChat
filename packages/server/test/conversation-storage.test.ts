import { describe, expect, it } from 'vitest'
import fs from 'fs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/lib/db'
import {
  createConversation,
  getConversationMessages,
  purgeExpiredDeletedConversations,
  setInitialPrompt,
  setConversationChunksWithTypes,
  storeMessage
} from '../src/storage/repository'
import {
  addToUserLibrary,
  addFileToConversation,
  getConversationDocsByType,
  updateUserDocName,
  uploadUserDocument
} from '../src/storage/document/file-manager'
import { getApiTestState, registerApiTestLifecycle } from './helpers/api-test-helper'

registerApiTestLifecycle()

describe('Initial Prompt', () => {
  it('should create conversation with initial_prompt', async () => {
    const convId = `conv_initial_${Date.now()}`
    const prompt = '请分析这份简历'
    await createConversation(convId, getApiTestState().testUserId, prompt)

    const [row] = await db
      .select({ initialPrompt: schema.conversations.initialPrompt })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, convId))
      .limit(1)

    expect(row?.initialPrompt).toBe(prompt)
  })

  it('should set initial_prompt correctly', async () => {
    const convId = `conv_setprompt_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    const prompt = '帮我优化简历'

    await setInitialPrompt(convId, prompt)

    const [row] = await db
      .select({ initialPrompt: schema.conversations.initialPrompt })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, convId))
      .limit(1)

    expect(row?.initialPrompt).toBe(prompt)
  })

  it('should return initial_prompt in messages response', async () => {
    const convId = `conv_msg_prompt_${Date.now()}`
    const prompt = '请分析这份简历'
    await createConversation(convId, getApiTestState().testUserId, prompt)
    await storeMessage(convId, 'user', prompt)
    await storeMessage(convId, 'assistant', '好的，我来分析...')

    const result = await getConversationMessages(convId, 1, 10)
    expect(result.initialPrompt).toBe(prompt)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('should return null initial_prompt when not set', async () => {
    const convId = `conv_no_prompt_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    const result = await getConversationMessages(convId, 1, 10)
    expect(result.initialPrompt).toBeNull()
  })
})

describe('Conversation trash purge', () => {
  it('should hard delete expired conversations and keep files referenced by user documents', async () => {
    const userId = getApiTestState().testUserId
    const now = Date.now()
    const expiredDeletedAt = now - 31 * 24 * 60 * 60 * 1000
    const purgedConvId = `conv_purge_only_${now}`
    const sharedConvId = `conv_purge_shared_${now}`

    await createConversation(purgedConvId, userId)
    await storeMessage(purgedConvId, 'user', '待删除消息')
    const purgedFile = await addFileToConversation(
      purgedConvId,
      Buffer.from(`purge-only-${now}`),
      `purge-only-${now}.pdf`,
      'pdf',
      'original',
      'resume'
    )
    await setConversationChunksWithTypes(
      purgedConvId,
      [{ pageContent: '待删除 chunk', metadata: {}, role: 'original', category: 'resume' }],
      purgedFile.refId
    )

    await createConversation(sharedConvId, userId)
    const sharedFile = await addFileToConversation(
      sharedConvId,
      Buffer.from(`purge-shared-${now}`),
      `purge-shared-${now}.pdf`,
      'pdf',
      'original',
      'resume'
    )
    await addToUserLibrary(
      userId,
      sharedFile.globalDocId,
      `purge-shared-${now}.pdf`,
      'conversation'
    )

    await db
      .update(schema.conversations)
      .set({ deletedAt: expiredDeletedAt })
      .where(eq(schema.conversations.id, purgedConvId))
    await db
      .update(schema.conversations)
      .set({ deletedAt: expiredDeletedAt })
      .where(eq(schema.conversations.id, sharedConvId))

    const result = await purgeExpiredDeletedConversations(now)

    expect(result.conversationsDeleted).toBeGreaterThanOrEqual(2)

    const [purgedConversation] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, purgedConvId))
      .limit(1)
    expect(purgedConversation).toBeUndefined()

    const purgedMessages = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, purgedConvId))
    const purgedChunks = await db
      .select({ id: schema.chunks.id })
      .from(schema.chunks)
      .where(eq(schema.chunks.conversationId, purgedConvId))
    const purgedRefs = await db
      .select({ id: schema.conversationDocumentRefs.id })
      .from(schema.conversationDocumentRefs)
      .where(eq(schema.conversationDocumentRefs.conversationId, purgedConvId))
    expect(purgedMessages).toHaveLength(0)
    expect(purgedChunks).toHaveLength(0)
    expect(purgedRefs).toHaveLength(0)

    const [purgedGlobalDoc] = await db
      .select({ id: schema.globalDocuments.id })
      .from(schema.globalDocuments)
      .where(eq(schema.globalDocuments.id, purgedFile.globalDocId))
      .limit(1)
    expect(purgedGlobalDoc).toBeUndefined()
    expect(fs.existsSync(purgedFile.filePath)).toBe(false)

    const [sharedGlobalDoc] = await db
      .select({ id: schema.globalDocuments.id })
      .from(schema.globalDocuments)
      .where(eq(schema.globalDocuments.id, sharedFile.globalDocId))
      .limit(1)
    expect(sharedGlobalDoc).toBeDefined()
    expect(fs.existsSync(sharedFile.filePath)).toBe(true)
  })
})

describe('Reasoning Persistence', () => {
  it('should store and return reasoning for assistant messages', async () => {
    const convId = `conv_reasoning_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    const reasoningText = '第一步：分析简历结构...第二步：提取关键技能...'
    await storeMessage(convId, 'user', '请分析简历')
    await storeMessage(convId, 'assistant', '分析结果...', reasoningText)

    const result = await getConversationMessages(convId, 1, 10)
    const assistantMsg = result.data.find((message) => message.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg?.reasoning).toBe(reasoningText)
  })

  it('should have empty reasoning by default', async () => {
    const convId = `conv_no_reasoning_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    await storeMessage(convId, 'user', '请分析')
    await storeMessage(convId, 'assistant', '好的')

    const result = await getConversationMessages(convId, 1, 10)
    result.data.forEach((message) => {
      expect(message).toHaveProperty('reasoning')
    })
  })

  it('should have empty reasoning for user messages', async () => {
    const convId = `conv_user_reasoning_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    await storeMessage(convId, 'user', '你好')
    await storeMessage(convId, 'assistant', '你好！', '助理推理')

    const result = await getConversationMessages(convId, 1, 10)
    const userMsg = result.data.find((message) => message.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg?.reasoning).toBe('')
  })
})

describe('Message ordering', () => {
  it('should keep user message before assistant placeholder when persisted sequentially', async () => {
    const convId = `conv_order_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await storeMessage(convId, 'user', '第一条用户消息')
    await storeMessage(convId, 'assistant', '第一条助手消息')

    const result = await getConversationMessages(convId, 1, 10, 'ASC')
    expect(result.data).toHaveLength(2)
    expect(result.data[0].role).toBe('user')
    expect(result.data[1].role).toBe('assistant')
  })

  it('should persist and return message attachments', async () => {
    const convId = `conv_attachments_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await storeMessage(convId, 'user', '请分析所附资料', undefined, undefined, undefined, [
      {
        type: 'reference',
        source: 'upload',
        name: '岗位说明.pdf',
        refId: 12,
        globalDocId: 34,
        fileType: 'pdf',
        fileSize: 1024,
        category: 'job'
      }
    ])

    const result = await getConversationMessages(convId, 1, 10, 'ASC')

    expect(result.data[0].attachments).toEqual([
      {
        type: 'reference',
        source: 'upload',
        name: '岗位说明.pdf',
        refId: 12,
        globalDocId: 34,
        fileType: 'pdf',
        fileSize: 1024,
        category: 'job'
      }
    ])
  })
})

describe('Conversation document display names', () => {
  it('should preserve local display name for conversation reference docs', async () => {
    const convId = `conv_ref_display_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await addFileToConversation(
      convId,
      Buffer.from(`library-doc-${Date.now()}`),
      'original-upload-name.pdf',
      'pdf',
      'reference',
      'job',
      undefined,
      { localName: '用户重命名的岗位说明' }
    )

    const docs = await getConversationDocsByType(convId, 'reference')
    expect(docs[0].original_name).toBe('original-upload-name.pdf')
    expect(docs[0].local_name).toBe('用户重命名的岗位说明')
  })

  it('should prefer current user document name for library-backed reference docs', async () => {
    const convId = `conv_ref_library_name_${Date.now()}`
    const buffer = Buffer.from(`library-backed-doc-${Date.now()}`)
    const userId = getApiTestState().testUserId
    await createConversation(convId, userId)
    const userDoc = await uploadUserDocument(userId, buffer, 'library-original.pdf')

    await addFileToConversation(
      convId,
      buffer,
      'library-original.pdf',
      'pdf',
      'reference',
      'job',
      undefined,
      {
        localName: '加入会话时的名称',
        sourceUserDocumentId: userDoc.id
      }
    )
    await updateUserDocName(userDoc.id, '文档库最新名称')

    const docs = await getConversationDocsByType(convId, 'reference')
    expect(docs[0].original_name).toBe('library-original.pdf')
    expect(docs[0].local_name).toBe('文档库最新名称')
    expect(docs[0].source_user_document_id).toBe(userDoc.id)
  })
})
