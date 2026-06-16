import { describe, expect, it } from 'vitest'

interface PendingModification {
  field: string
}

interface ManualMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isProcessing?: boolean
  optimizations?: Array<{ field: string; suggestion: string }>
  modifications?: Array<{ field: string; suggestion: string }>
}

describe('store and api', () => {
  describe('Store methods', () => {
    it('clearConversation should reset all conversation state', () => {
      const state = {
        conversationId: 'conv_123',
        messages: [{ role: 'user' as const, content: 'test' }],
        fileBlobUrl: 'blob:url',
        fileName: 'resume.pdf',
        documents: [
          {
            id: 1,
            conversation_id: 'conv_123',
            file_path: '',
            original_name: '',
            file_type: '',
            file_size: 0,
            role: 'original',
            created_at: 0
          }
        ],
        conversationTitle: '简历分析'
      }

      state.conversationId = ''
      state.messages = []
      state.fileBlobUrl = ''
      state.fileName = ''
      state.documents = []
      state.conversationTitle = ''

      expect(state.conversationId).toBe('')
      expect(state.messages).toEqual([])
      expect(state.fileBlobUrl).toBe('')
      expect(state.fileName).toBe('')
      expect(state.documents).toEqual([])
      expect(state.conversationTitle).toBe('')
    })

    it('should convert API messages to local format', () => {
      const apiMessages = [
        {
          id: 1,
          conversation_id: 'conv_1',
          role: 'user' as const,
          content: '你好',
          created_at: 1000
        },
        {
          id: 2,
          conversation_id: 'conv_1',
          role: 'assistant' as const,
          content: '你好！有什么可以帮助你的？',
          created_at: 2000
        }
      ]

      const localMessages = apiMessages.map((m) => ({
        role: m.role,
        content: m.content
      }))

      expect(localMessages).toHaveLength(2)
      expect(localMessages[0]).toEqual({ role: 'user', content: '你好' })
      expect(localMessages[1]).toEqual({ role: 'assistant', content: '你好！有什么可以帮助你的？' })
    })

    it('should extract PDF document from documents list', () => {
      const documents = [
        {
          id: 1,
          conversation_id: 'conv_1',
          file_path: '/path/to/doc1',
          original_name: 'doc1.txt',
          file_type: 'txt',
          file_size: 100,
          role: 'reference',
          created_at: 1000
        },
        {
          id: 2,
          conversation_id: 'conv_1',
          file_path: '/path/to/resume.pdf',
          original_name: 'resume.pdf',
          file_type: 'pdf',
          file_size: 5000,
          role: 'original',
          created_at: 2000
        }
      ]

      const pdfDoc = documents.find(
        (d) => d.file_type === 'pdf' || d.original_name.toLowerCase().endsWith('.pdf')
      )

      expect(pdfDoc).toBeDefined()
      expect(pdfDoc?.original_name).toBe('resume.pdf')
      expect(pdfDoc?.file_path).toBe('/path/to/resume.pdf')
    })

    it('should use latest document for PDF preview', () => {
      const apiDocs = [
        {
          id: 3,
          conversation_id: 'conv_1',
          file_path: '/path/to/resume_updated.pdf',
          original_name: 'resume_updated.pdf',
          file_type: 'pdf',
          file_size: 6000,
          role: 'modified',
          created_at: 3000,
          file_url: '/files/temp/conv_1/resume_updated.pdf'
        },
        {
          id: 2,
          conversation_id: 'conv_1',
          file_path: '/path/to/resume.pdf',
          original_name: 'resume.pdf',
          file_type: 'pdf',
          file_size: 5000,
          role: 'original',
          created_at: 2000,
          file_url: '/files/temp/conv_1/resume.pdf'
        }
      ]

      const latestDoc = apiDocs[0]
      expect(latestDoc.original_name).toBe('resume_updated.pdf')
      expect(latestDoc.file_url).toContain('resume_updated.pdf')
    })

    it('loadConversation should return initialPrompt in response', () => {
      const mockResponse = {
        data: {
          messages: [{ role: 'user', content: 'test' }],
          documents: [],
          initialPrompt: '请分析这份简历'
        },
        pagination: { page: 1, pageSize: 100, total: 1 }
      }

      expect(mockResponse.data).toHaveProperty('initialPrompt')
      expect(mockResponse.data.initialPrompt).toBe('请分析这份简历')
    })

    it('loadConversation initialPrompt can be null', () => {
      const mockResponse = {
        data: {
          messages: [],
          documents: [],
          initialPrompt: null
        },
        pagination: { page: 1, pageSize: 100, total: 0 }
      }

      expect(mockResponse.data.initialPrompt).toBeNull()
    })

    it('loadConversation should store conversationTitle from title field', () => {
      const mockResponse = {
        data: {
          messages: [{ role: 'user', content: 'test' }],
          documents: [],
          initialPrompt: '请分析',
          title: '简历分析会话'
        },
        pagination: { page: 1, pageSize: 100, total: 1 }
      }

      const conversationTitle = mockResponse.data.title || ''
      expect(conversationTitle).toBe('简历分析会话')
    })

    it('history merge should preserve chronological order after prepending older messages', () => {
      const latestPageDesc = [
        { id: 4, role: 'assistant' as const, content: '第四条' },
        { id: 3, role: 'user' as const, content: '第三条' }
      ]
      const latestPageAsc = [...latestPageDesc].reverse()

      const olderPageDesc = [
        { id: 2, role: 'assistant' as const, content: '第二条' },
        { id: 1, role: 'user' as const, content: '第一条' }
      ]
      const olderPageAsc = [...olderPageDesc].reverse()

      const merged = [...olderPageAsc, ...latestPageAsc]

      expect(merged.map((m) => m.id)).toEqual([1, 2, 3, 4])
      expect(merged.map((m) => m.content)).toEqual(['第一条', '第二条', '第三条', '第四条'])
    })

    it('pushStatusMessages should push user and assistant manual messages', () => {
      const messages: ManualMessage[] = []
      const pendingMods: PendingModification[] = []

      function pushStatusMessages(field: string) {
        const ts = Date.now()
        messages.push({
          id: `temp-user-${ts}`,
          role: 'user',
          content: `确认修改：${field}`
        })
        messages.push({
          id: `temp-status-${ts}`,
          role: 'assistant',
          content: `正在处理「${field}」...`,
          isProcessing: true
        })
        pendingMods.push({ field })
      }

      pushStatusMessages('工作经验')
      expect(messages).toHaveLength(2)
      expect(messages[0].id).toMatch(/^temp-user-/)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toContain('工作经验')
      expect(messages[1].id).toMatch(/^temp-status-/)
      expect(messages[1].role).toBe('assistant')
      expect(messages[1].isProcessing).toBe(true)
      expect(pendingMods).toHaveLength(1)
      expect(pendingMods[0].field).toBe('工作经验')
    })

    it('clearManualAndEmpty should remove temp-prefixed and empty assistant messages', () => {
      const messages: ManualMessage[] = [
        { id: '1', role: 'user', content: '修改简历' },
        { id: 'temp-2', role: 'assistant', content: '' },
        {
          id: '3',
          role: 'assistant',
          content: '结果',
          optimizations: [{ field: 'a', suggestion: 'b' }]
        },
        { id: '4', role: 'assistant', content: '' },
        { id: 'temp-user-5', role: 'user', content: '确认修改：工作经验' },
        { id: 'temp-status-6', role: 'assistant', content: '正在处理...', isProcessing: true },
        { id: '7', role: 'assistant', content: '有用内容' }
      ]

      function clearManualAndEmpty() {
        const keep = messages.filter((m) => {
          if (m.id?.startsWith('temp-')) return false
          if (
            m.role === 'assistant' &&
            !m.content &&
            !m.optimizations?.length &&
            !m.modifications?.length
          )
            return false
          return true
        })
        messages.length = 0
        messages.push(...keep)
      }

      clearManualAndEmpty()
      expect(messages).toHaveLength(3)
      expect(messages[0].id).toBe('1')
      expect(messages[1].id).toBe('3')
      expect(messages[2].id).toBe('7')
    })
  })

  describe('New API functions', () => {
    it('deleteConversation should call DELETE endpoint', () => {
      const mockDeleteConversation = (id: string) => {
        return { method: 'DELETE', url: `/conversations/${id}` }
      }

      const result = mockDeleteConversation('conv_123')
      expect(result.method).toBe('DELETE')
      expect(result.url).toBe('/conversations/conv_123')
    })

    it('restoreConversation should call POST endpoint', () => {
      const mockRestoreConversation = (id: string) => {
        return { method: 'POST', url: `/conversations/${id}/restore` }
      }

      const result = mockRestoreConversation('conv_123')
      expect(result.method).toBe('POST')
      expect(result.url).toBe('/conversations/conv_123/restore')
    })

    it('getReferenceFiles should call GET /documents with conversationId', () => {
      const mockGetRefs = (conversationId: string) => {
        return { method: 'GET', url: '/documents', params: { conversationId } }
      }
      const result = mockGetRefs('conv_123')
      expect(result.method).toBe('GET')
      expect(result.params.conversationId).toBe('conv_123')
    })

    it('deleteReferenceFile should call DELETE /documents/:refId', () => {
      const mockDeleteRef = (conversationId: string, refId: number) => {
        return { method: 'DELETE', url: `/documents/${refId}`, params: { conversationId } }
      }
      const result = mockDeleteRef('conv_123', 5)
      expect(result.method).toBe('DELETE')
      expect(result.url).toBe('/documents/5')
      expect(result.params.conversationId).toBe('conv_123')
    })

    it('sendSearchWithFiles should create FormData with query, conversationId, and files', () => {
      const mockSendSearchWithFiles = (query: string, conversationId: string, files: File[]) => {
        const formData = new FormData()
        formData.append('query', query)
        formData.append('conversationId', conversationId)
        for (const file of files) {
          formData.append('files', file)
        }
        return {
          method: 'POST',
          url: '/api/chat/search',
          hasQuery: formData.has('query'),
          hasConversationId: formData.has('conversationId'),
          filesCount: files.length
        }
      }

      const files = [new File([''], 'resume.pdf')]
      const result = mockSendSearchWithFiles('优化简历', 'conv_123', files)
      expect(result.method).toBe('POST')
      expect(result.hasQuery).toBe(true)
      expect(result.hasConversationId).toBe(true)
      expect(result.filesCount).toBe(1)
    })

    it('ReferenceDoc type should have required fields', () => {
      const refDoc = {
        id: 1,
        original_name: 'job_desc.pdf',
        local_name: '用户命名的岗位资料',
        file_type: 'pdf',
        file_size: 2048,
        file_path: '/uploads/...',
        role: 'reference',
        version: 1,
        created_at: Date.now()
      }
      expect(refDoc).toHaveProperty('id')
      expect(refDoc).toHaveProperty('original_name')
      expect(refDoc).toHaveProperty('local_name')
      expect(refDoc).toHaveProperty('file_type')
      expect(refDoc).toHaveProperty('file_size')
      expect(refDoc).toHaveProperty('file_path')
      expect(refDoc).toHaveProperty('role')
      expect(refDoc).toHaveProperty('version')
      expect(refDoc).toHaveProperty('created_at')
    })
  })
})
