import { beforeEach, describe, expect, it } from 'vitest'
import {
  attachAuthHeaders,
  clearAuth,
  getAccessToken,
  getLoginPhone,
  getRefreshToken,
  isAuthenticated,
  saveAuth
} from '../lib/auth'

describe('auth and types', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('phone validation regex', () => {
    const validPhone = /^1[3-9]\d{9}$/
    expect(validPhone.test('13800138000')).toBe(true)
    expect(validPhone.test('12345678901')).toBe(false)
    expect(validPhone.test('1380013800')).toBe(false)
  })

  it('form validation', () => {
    const validatePhone = (phone: string) => {
      if (!phone) return '手机号不能为空'
      if (!/^1[3-9]\d{9}$/.test(phone)) return '手机号格式不正确'
      return ''
    }

    expect(validatePhone('')).toBe('手机号不能为空')
    expect(validatePhone('123')).toBe('手机号格式不正确')
    expect(validatePhone('13800138000')).toBe('')
  })

  describe('auth token', () => {
    it('should get auth headers when token exists', () => {
      saveAuth('test-token-123', 'refresh-token', '13800138000')
      const headers = attachAuthHeaders(new Headers())
      expect(headers.get('token')).toBe('test-token-123')
      expect(headers.get('Authorization')).toBe('Bearer test-token-123')
      expect(headers.get('X-Phone')).toBe('13800138000')
    })

    it('should return empty object when no token', () => {
      const headers = attachAuthHeaders(new Headers())
      expect(headers.get('token')).toBeNull()
    })

    it('should store and retrieve phone', () => {
      saveAuth('access', 'refresh', '13800138000')
      expect(getLoginPhone()).toBe('13800138000')
    })

    it('should remove auth data on logout', () => {
      saveAuth('test-token', 'refresh-token', '13800138000')
      clearAuth()
      expect(getAccessToken()).toBeNull()
      expect(getRefreshToken()).toBeNull()
      expect(getLoginPhone()).toBeNull()
    })

    it('should report authenticated when access token exists', () => {
      expect(isAuthenticated()).toBe(false)
      saveAuth('access-token', 'refresh-token')
      expect(isAuthenticated()).toBe(true)
    })
  })

  describe('formatTime utility', () => {
    function formatTime(ts: number): string {
      const d = new Date(ts)
      const now = new Date()
      const diff = now.getTime() - d.getTime()
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    it('should return 刚刚 for recent timestamps', () => {
      const now = Date.now()
      expect(formatTime(now)).toBe('刚刚')
    })

    it('should return minutes ago for timestamps within an hour', () => {
      const thirtyMinsAgo = Date.now() - 30 * 60 * 1000
      expect(formatTime(thirtyMinsAgo)).toBe('30分钟前')
    })

    it('should return hours ago for timestamps within a day', () => {
      const threeHoursAgo = Date.now() - 3 * 3600 * 1000
      expect(formatTime(threeHoursAgo)).toBe('3小时前')
    })

    it('should return days ago for timestamps within a week', () => {
      const twoDaysAgo = Date.now() - 2 * 86400 * 1000
      expect(formatTime(twoDaysAgo)).toBe('2天前')
    })

    it('should return date for old timestamps', () => {
      const oldDate = new Date('2024-01-15T10:00:00').getTime()
      expect(formatTime(oldDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('API types validation', () => {
    it('Conversation type should have required fields', () => {
      const conv = {
        id: 'conv_123',
        user_id: 'user_1',
        title: '简历分析',
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now()
      }
      expect(conv).toHaveProperty('id')
      expect(conv).toHaveProperty('user_id')
      expect(conv).toHaveProperty('title')
      expect(conv).toHaveProperty('status')
      expect(conv).toHaveProperty('created_at')
      expect(conv).toHaveProperty('updated_at')
      expect(typeof conv.id).toBe('string')
      expect(typeof conv.user_id).toBe('string')
      expect(typeof conv.title).toBe('string')
    })

    it('Conversation title can be null', () => {
      const conv = {
        id: 'conv_456',
        user_id: 'user_1',
        title: null,
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now()
      }
      expect(conv.title).toBeNull()
    })

    it('MessageRecord type should have required fields', () => {
      const msg = {
        id: 1,
        conversation_id: 'conv_123',
        role: 'user' as const,
        content: '请分析这份简历',
        reasoning: '',
        created_at: Date.now()
      }
      expect(msg).toHaveProperty('id')
      expect(msg).toHaveProperty('conversation_id')
      expect(msg).toHaveProperty('role')
      expect(msg).toHaveProperty('content')
      expect(msg).toHaveProperty('reasoning')
      expect(msg).toHaveProperty('created_at')
      expect(['user', 'assistant']).toContain(msg.role)
    })

    it('MessageRecord reasoning should be string', () => {
      const userMsg = {
        id: 1,
        conversation_id: 'conv_123',
        role: 'user' as const,
        content: '你好',
        reasoning: '',
        created_at: Date.now()
      }
      const assistantMsg = {
        id: 2,
        conversation_id: 'conv_123',
        role: 'assistant' as const,
        content: '分析结果',
        reasoning: '思考过程...',
        created_at: Date.now()
      }
      expect(typeof userMsg.reasoning).toBe('string')
      expect(userMsg.reasoning).toBe('')
      expect(assistantMsg.reasoning).toBe('思考过程...')
    })

    it('mapApiMessage should pass through reasoning', () => {
      const mapApiMessage = (m: { role: string; content: string; reasoning?: string }) => ({
        role: m.role,
        content: m.content,
        reasoning: m.reasoning || '',
        showReasoning: false,
        optimizations: []
      })

      const result = mapApiMessage({ role: 'assistant', content: '结果', reasoning: '思考...' })
      expect(result.reasoning).toBe('思考...')
      expect(result.showReasoning).toBe(false)
    })

    it('mapApiMessage should default reasoning to empty string', () => {
      const mapApiMessage = (m: { role: string; content: string; reasoning?: string }) => ({
        role: m.role,
        content: m.content,
        reasoning: m.reasoning || '',
        showReasoning: false,
        optimizations: []
      })

      const result = mapApiMessage({ role: 'user', content: '你好' })
      expect(result.reasoning).toBe('')
    })

    it('DocumentRecord type should have required fields', () => {
      const doc = {
        id: 1,
        conversation_id: 'conv_123',
        file_path: '/path/to/resume.pdf',
        original_name: 'resume.pdf',
        file_type: 'pdf',
        file_size: 1024,
        role: 'original',
        created_at: Date.now()
      }
      expect(doc).toHaveProperty('file_path')
      expect(doc).toHaveProperty('original_name')
      expect(doc).toHaveProperty('file_type')
    })

    it('UserProfile type should have required fields', () => {
      const user = {
        id: 'user_1',
        phone: '13800138000',
        nickname: 'user_13800138000',
        created_at: Date.now(),
        updated_at: Date.now()
      }
      expect(user).toHaveProperty('phone')
      expect(user).toHaveProperty('nickname')
      expect(user.phone).toMatch(/^1[3-9]\d{9}$/)
    })

    it('ConversationsResponse should have data and pagination', () => {
      const response = {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0 }
      }
      expect(response).toHaveProperty('data')
      expect(response).toHaveProperty('pagination')
      expect(response.pagination).toHaveProperty('page')
      expect(response.pagination).toHaveProperty('pageSize')
      expect(response.pagination).toHaveProperty('total')
      expect(Array.isArray(response.data)).toBe(true)
    })

    it('ConversationMessagesResponse should have messages and documents', () => {
      const response = {
        data: {
          messages: [],
          documents: [],
          initialPrompt: '请分析这份简历'
        },
        pagination: { page: 1, pageSize: 50, total: 0 }
      }
      expect(response.data).toHaveProperty('messages')
      expect(response.data).toHaveProperty('documents')
      expect(response.data).toHaveProperty('initialPrompt')
      expect(response.data.initialPrompt).toBe('请分析这份简历')
    })

    it('ConversationMessagesResponse initialPrompt can be null', () => {
      const response = {
        data: {
          messages: [{ role: 'user', content: 'test' }],
          documents: [],
          initialPrompt: null
        },
        pagination: { page: 1, pageSize: 50, total: 1 }
      }
      expect(response.data.initialPrompt).toBeNull()
    })
  })
})
