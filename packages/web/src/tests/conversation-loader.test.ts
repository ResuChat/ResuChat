import { describe, expect, it } from 'vitest'
import { buildConversationSnapshot, getDocumentDownloadPath } from '../lib/conversation-loader'

describe('conversation-loader', () => {
  it('应将文档下载路径标准化为 api 客户端可用路径', () => {
    expect(getDocumentDownloadPath('/api/documents/1/download')).toBe('/documents/1/download')
    expect(getDocumentDownloadPath('/documents/1/download')).toBe('/documents/1/download')
  })

  it('应将会话响应整理为前端快照结构', () => {
    const snapshot = buildConversationSnapshot(
      {
        data: {
          messages: [
            {
              id: 1,
              conversation_id: 'conv_1',
              role: 'assistant',
              content: '分析结果',
              reasoning: '推理',
              created_at: Date.now()
            },
            {
              id: 2,
              conversation_id: 'conv_1',
              role: 'user',
              content: '请分析',
              created_at: Date.now()
            }
          ],
          documents: [
            {
              id: 1,
              conversation_id: 'conv_1',
              file_path: '/tmp/a.pdf',
              file_url: '/documents/1/download',
              original_name: 'resume.pdf',
              file_type: 'pdf',
              file_size: 1024,
              role: 'original',
              created_at: Date.now()
            }
          ],
          initialPrompt: null,
          title: null,
          resumeContent: '## 简历',
          originalRefId: 7
        },
        pagination: { page: 1, pageSize: 100, total: 2 }
      },
      [
        {
          id: 'conv_1',
          user_id: 'u1',
          title: '历史标题',
          status: 'active',
          created_at: 1,
          updated_at: 1
        }
      ],
      'conv_1'
    )

    expect(snapshot.totalMessages).toBe(2)
    expect(snapshot.initialPrompt).toBe('')
    expect(snapshot.title).toBe('历史标题')
    expect(snapshot.messages[0].role).toBe('user')
    expect(snapshot.messages[1].role).toBe('assistant')
    expect(snapshot.resumeContent).toBe('## 简历')
    expect(snapshot.originalRefId).toBe(7)
  })
})
