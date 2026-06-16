import { beforeEach, describe, expect, it, vi } from 'vitest'

const getConversationChunksWithTypes = vi.fn()
const getConversationDocs = vi.fn()
const getConversationDocsByType = vi.fn()
const listEffectivelyActiveSystemDocumentGroupIds = vi.fn()
const processDocIdsAsReference = vi.fn()
const processFileAsReference = vi.fn()
const searchSystemChunks = vi.fn()

vi.mock('../src/storage/repository', () => ({
  getConversationChunksWithTypes,
  getConversationDocs
}))

vi.mock('../src/storage/document/file-manager', () => ({
  getConversationDocsByType,
  listEffectivelyActiveSystemDocumentGroupIds
}))

vi.mock('../src/lib/document/vector-db', () => ({
  searchSystemChunks
}))

vi.mock('../src/services/chat/file-processor.service', () => ({
  processDocIdsAsReference,
  processFileAsReference
}))

vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn()
  }
}))

describe('buildRagContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConversationChunksWithTypes.mockResolvedValue([])
    getConversationDocs.mockResolvedValue([])
    getConversationDocsByType.mockResolvedValue([])
    listEffectivelyActiveSystemDocumentGroupIds.mockResolvedValue([8])
    processDocIdsAsReference.mockResolvedValue([])
    processFileAsReference.mockResolvedValue(null)
    searchSystemChunks.mockResolvedValue([
      { text: '系统知识 A', score: 0.9, systemDocId: 1, globalDocId: 1, groupId: 8 },
      { text: '系统知识 B', score: 0.8, systemDocId: 2, globalDocId: 2, groupId: 8 },
      { text: '系统知识 C', score: 0.7, systemDocId: 3, globalDocId: 3, groupId: 8 },
      { text: '系统知识 D', score: 0.6, systemDocId: 4, globalDocId: 4, groupId: 8 }
    ])
  })

  it('uses system knowledge even when conversation chunks are empty', async () => {
    const { buildRagContext } = await import('../src/services/chat/context.service')

    const context = await buildRagContext({
      query: '怎么优化项目经历',
      conversationId: 'conv_empty_chunks'
    })

    expect(getConversationChunksWithTypes).toHaveBeenCalledWith('conv_empty_chunks')
    expect(getConversationDocs).toHaveBeenCalledWith('conv_empty_chunks')
    expect(searchSystemChunks).toHaveBeenCalledWith('怎么优化项目经历', {
      k: 12,
      activeGroupIds: [8]
    })
    expect(context.referenceDocContent).toContain('【系统知识库相关参考】')
    expect(context.referenceDocContent).toContain('系统知识 A')
    expect(context.referenceDocContent).toContain('系统知识 B')
    expect(context.referenceDocContent).toContain('系统知识 C')
    expect(context.referenceDocContent).not.toContain('系统知识 D')
  })
})
