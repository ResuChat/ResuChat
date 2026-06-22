import { describe, expect, it } from 'vitest'
import { getApiTestState, registerApiTestLifecycle, request } from './helpers/api-test-helper'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/lib/db'
import { createConversation, ensureUser } from '../src/storage/repository'

registerApiTestLifecycle()

describe('Root API', () => {
  it('should return welcome message', async () => {
    const { status, body } = await request({ path: '/' })
    expect(status).toBe(200)
    expect(body).toContain('AI Agent BFF Layer Running')
  })
})

describe('Auth API', () => {
  it('should return 400 when login params missing', async () => {
    const { status } = await request({ path: '/auth/login', body: {} })
    expect(status).toBe(400)
  })

  it('should return 200 when logout', async () => {
    const { accessToken, refreshToken } = getApiTestState()
    const { status } = await request({
      path: '/auth/logout',
      method: 'POST',
      token: accessToken,
      body: { refreshToken }
    })
    expect(status).toBe(200)
  })
})

describe('Captcha API', () => {
  it('should return 400 when phone missing', async () => {
    const { status } = await request({ path: '/auth/captcha/generate', body: {} })
    expect(status).toBe(400)
  })
})

describe('RAG API', () => {
  it('should return 401 when token missing for search', async () => {
    const { testConversationId } = getApiTestState()
    const { status } = await request({
      path: '/chat/search',
      body: { query: 'test', conversationId: testConversationId, assistantMsgId: 'assistant-auth' }
    })
    expect(status).toBe(401)
  })

  it('should return 400 before auth when search body is invalid', async () => {
    const { status, body } = await request({
      path: '/chat/search',
      body: { query: 'test' }
    })

    expect(status).toBe(400)
    expect(body).toContain('conversationId')
  })

  it('should require conversationId for search', async () => {
    const { accessToken } = getApiTestState()
    const { status, body } = await request({
      path: '/chat/search',
      token: accessToken,
      body: { query: 'test', assistantMsgId: 'assistant-missing-conversation' }
    })

    expect(status).toBe(400)
    expect(body).toContain('conversationId')
  })

  it('should require assistantMsgId for search', async () => {
    const { accessToken, testConversationId } = getApiTestState()
    const { status, body } = await request({
      path: '/chat/search',
      token: accessToken,
      body: { query: 'test', conversationId: testConversationId }
    })

    expect(status).toBe(400)
    expect(body).toContain('assistantMsgId')
  })

  it('should reject search for conversations owned by another user', async () => {
    const { accessToken } = getApiTestState()
    const otherUserId = await ensureUser(`188${Date.now().toString().slice(-8)}`)
    const otherConversationId = `conv_other_${Date.now()}`
    await createConversation(otherConversationId, otherUserId)

    const { status } = await request({
      path: '/chat/search',
      token: accessToken,
      body: {
        query: 'test',
        conversationId: otherConversationId,
        assistantMsgId: 'assistant-other-owner'
      }
    })

    expect(status).toBe(403)
  })

  it('should return 401 when token missing for start', async () => {
    const { status } = await request({ path: '/conversations/start', body: {} })
    expect(status).toBe(401)
  })

  it('should reject starting conversation without file or library doc', async () => {
    const { accessToken } = getApiTestState()
    const conversationId = `conv_${Date.now()}_emptydoc`
    const { status, body } = await request({
      path: '/conversations/start-from-doc',
      token: accessToken,
      body: { conversationId, query: '看看这份简历' }
    })

    const [row] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1)
    expect(status).toBe(400)
    expect(body).toContain('请先上传简历或选择文档库中的简历')
    expect(row).toBeUndefined()
  })

  it('should return 401 when token missing for apply-modification', async () => {
    const { testConversationId } = getApiTestState()
    const { status } = await request({
      path: '/modify/apply',
      body: {
        conversationId: testConversationId,
        optimization: {
          field: '项目经历',
          current: '旧内容',
          suggestion: '新内容'
        }
      }
    })
    expect(status).toBe(401)
  })
})

describe('Conversation Trash API', () => {
  it('should hide soft-deleted conversations from normal conversation operations', async () => {
    const { accessToken, testUserId } = getApiTestState()
    const conversationId = `conv_soft_delete_${Date.now()}`
    await createConversation(conversationId, testUserId)

    const deleteResult = await request({
      path: `/conversations/${conversationId}`,
      method: 'DELETE',
      token: accessToken
    })
    expect(deleteResult.status).toBe(200)

    const messagesResult = await request({
      path: `/conversations/${conversationId}/messages`,
      token: accessToken
    })
    expect(messagesResult.status).toBe(403)

    const searchResult = await request({
      path: '/chat/search',
      token: accessToken,
      body: { query: 'test', conversationId, assistantMsgId: 'assistant-soft-deleted' }
    })
    expect(searchResult.status).toBe(403)

    const modifyResult = await request({
      path: '/modify/apply',
      token: accessToken,
      body: {
        conversationId,
        type: 'apply',
        optimization: {
          field: '项目经历',
          current: '旧内容',
          suggestion: '新内容'
        }
      }
    })
    expect(modifyResult.status).toBe(403)

    const docsResult = await request({
      path: `/documents?conversationId=${conversationId}`,
      token: accessToken
    })
    expect(docsResult.status).toBe(403)
  })

  it('should list only recoverable deleted conversations', async () => {
    const { accessToken, testUserId } = getApiTestState()
    const recoverableId = `conv_deleted_recoverable_${Date.now()}`
    const expiredId = `conv_deleted_expired_${Date.now()}`
    await createConversation(recoverableId, testUserId)
    await createConversation(expiredId, testUserId)

    await db
      .update(schema.conversations)
      .set({ deletedAt: Date.now() - 1000 })
      .where(eq(schema.conversations.id, recoverableId))
    await db
      .update(schema.conversations)
      .set({ deletedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 })
      .where(eq(schema.conversations.id, expiredId))

    const { status, body } = await request({
      path: '/conversations/deleted',
      token: accessToken
    })

    expect(status).toBe(200)
    const payload = JSON.parse(body) as { data: Array<{ id: string }> }
    expect(payload.data.some((conversation) => conversation.id === recoverableId)).toBe(true)
    expect(payload.data.some((conversation) => conversation.id === expiredId)).toBe(false)
  })

  it('should restore recoverable deleted conversations and reject expired restores', async () => {
    const { accessToken, testUserId } = getApiTestState()
    const recoverableId = `conv_restore_recoverable_${Date.now()}`
    const expiredId = `conv_restore_expired_${Date.now()}`
    await createConversation(recoverableId, testUserId)
    await createConversation(expiredId, testUserId)

    await request({
      path: `/conversations/${recoverableId}`,
      method: 'DELETE',
      token: accessToken
    })
    await db
      .update(schema.conversations)
      .set({ deletedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 })
      .where(eq(schema.conversations.id, expiredId))

    const restoreResult = await request({
      path: `/conversations/${recoverableId}/restore`,
      method: 'POST',
      token: accessToken
    })
    expect(restoreResult.status).toBe(200)

    const [restored] = await db
      .select({ deletedAt: schema.conversations.deletedAt })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, recoverableId))
      .limit(1)
    expect(restored?.deletedAt).toBeNull()

    const expiredRestoreResult = await request({
      path: `/conversations/${expiredId}/restore`,
      method: 'POST',
      token: accessToken
    })
    expect(expiredRestoreResult.status).toBe(404)
  })
})

describe('Admin API', () => {
  it('should reject system document access for normal users', async () => {
    const { accessToken } = getApiTestState()
    await db
      .update(schema.users)
      .set({ role: 'normal' })
      .where(eq(schema.users.id, getApiTestState().testUserId))

    const { status } = await request({
      path: '/admin/system-documents',
      token: accessToken
    })

    expect(status).toBe(403)
  })

  it('should allow system document access for admin users', async () => {
    const { accessToken } = getApiTestState()
    await db
      .update(schema.users)
      .set({ role: 'admin' })
      .where(eq(schema.users.id, getApiTestState().testUserId))

    const { status } = await request({
      path: '/admin/system-documents',
      token: accessToken
    })

    expect(status).toBe(200)

    await db
      .update(schema.users)
      .set({ role: 'normal' })
      .where(eq(schema.users.id, getApiTestState().testUserId))
  })

  it('should allow admins to manage system document groups', async () => {
    const { accessToken } = getApiTestState()
    await db
      .update(schema.users)
      .set({ role: 'admin' })
      .where(eq(schema.users.id, getApiTestState().testUserId))

    const createResult = await request({
      path: '/admin/system-document-groups',
      token: accessToken,
      body: { name: `测试分组-${Date.now()}`, parentId: null }
    })
    expect(createResult.status).toBe(201)
    const created = JSON.parse(createResult.body).data as { id: number }

    const patchResult = await request({
      path: `/admin/system-document-groups/${created.id}`,
      method: 'PATCH',
      token: accessToken,
      body: { name: `测试分组改名-${Date.now()}` }
    })
    expect(patchResult.status).toBe(200)

    const listResult = await request({
      path: '/admin/system-document-groups',
      token: accessToken
    })
    expect(listResult.status).toBe(200)
    expect(JSON.parse(listResult.body).data.length).toBeGreaterThan(0)

    const deleteResult = await request({
      path: `/admin/system-document-groups/${created.id}`,
      method: 'DELETE',
      token: accessToken
    })
    expect(deleteResult.status).toBe(200)

    await db
      .update(schema.users)
      .set({ role: 'normal' })
      .where(eq(schema.users.id, getApiTestState().testUserId))
  })

  it('should cascade disabled system groups and return direct document counts', async () => {
    const { accessToken } = getApiTestState()
    await db
      .update(schema.users)
      .set({ role: 'admin' })
      .where(eq(schema.users.id, getApiTestState().testUserId))

    const suffix = Date.now()
    const parentResult = await request({
      path: '/admin/system-document-groups',
      token: accessToken,
      body: { name: `父级-${suffix}`, parentId: null }
    })
    expect(parentResult.status).toBe(201)
    const parent = JSON.parse(parentResult.body).data as { id: number }

    const childResult = await request({
      path: '/admin/system-document-groups',
      token: accessToken,
      body: { name: `子级-${suffix}`, parentId: parent.id }
    })
    expect(childResult.status).toBe(201)
    const child = JSON.parse(childResult.body).data as { id: number; name: string }

    const [globalDoc] = await db
      .insert(schema.globalDocuments)
      .values({
        fileHash: `system-group-count-${suffix}`,
        filePath: `test-system-group-count-${suffix}.txt`,
        originalName: `system-group-count-${suffix}.txt`,
        fileType: 'txt',
        fileSize: 12,
        createdAt: Date.now()
      })
      .returning({ id: schema.globalDocuments.id })

    const [systemDoc] = await db
      .insert(schema.systemDocuments)
      .values({
        globalDocId: globalDoc.id,
        groupId: child.id,
        category: 'unknown',
        groupName: child.name,
        localName: `system-group-count-${suffix}.txt`,
        indexStatus: 'done',
        chunksCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      .returning({ id: schema.systemDocuments.id })

    const countResult = await request({
      path: '/admin/system-document-groups',
      token: accessToken
    })
    expect(countResult.status).toBe(200)
    const groups = JSON.parse(countResult.body).data as {
      id: number
      active: boolean
      document_count: number
    }[]
    expect(groups.find((group) => group.id === parent.id)?.document_count).toBe(0)
    expect(groups.find((group) => group.id === child.id)?.document_count).toBe(1)

    const disableResult = await request({
      path: `/admin/system-document-groups/${parent.id}`,
      method: 'PATCH',
      token: accessToken,
      body: { active: false }
    })
    expect(disableResult.status).toBe(200)

    const disabledListResult = await request({
      path: '/admin/system-document-groups',
      token: accessToken
    })
    const disabledGroups = JSON.parse(disabledListResult.body).data as {
      id: number
      active: boolean
    }[]
    expect(disabledGroups.find((group) => group.id === parent.id)?.active).toBe(false)
    expect(disabledGroups.find((group) => group.id === child.id)?.active).toBe(false)

    const enableChildResult = await request({
      path: `/admin/system-document-groups/${child.id}`,
      method: 'PATCH',
      token: accessToken,
      body: { active: true }
    })
    expect(enableChildResult.status).toBe(400)

    await db.delete(schema.systemDocuments).where(eq(schema.systemDocuments.id, systemDoc.id))
    await db.delete(schema.systemDocumentGroups).where(eq(schema.systemDocumentGroups.id, child.id))
    await db
      .delete(schema.systemDocumentGroups)
      .where(eq(schema.systemDocumentGroups.id, parent.id))
    await db.delete(schema.globalDocuments).where(eq(schema.globalDocuments.id, globalDoc.id))

    await db
      .update(schema.users)
      .set({ role: 'normal' })
      .where(eq(schema.users.id, getApiTestState().testUserId))
  })

  it('should reject system document upload without group id', async () => {
    const { accessToken } = getApiTestState()
    await db
      .update(schema.users)
      .set({ role: 'admin' })
      .where(eq(schema.users.id, getApiTestState().testUserId))

    const { status } = await request({
      path: '/admin/system-documents',
      token: accessToken,
      body: {}
    })

    expect(status).toBe(400)

    await db
      .update(schema.users)
      .set({ role: 'normal' })
      .where(eq(schema.users.id, getApiTestState().testUserId))
  })
})
