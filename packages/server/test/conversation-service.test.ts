import { beforeEach, describe, expect, it, vi } from 'vitest'

const addFileToConversation = vi.fn()
const cleanupOldVersions = vi.fn()
const updateDocumentRefSnapshot = vi.fn()
const addToUserLibrary = vi.fn()
const getUserDocsWithFiles = vi.fn()
const createConversation = vi.fn()
const deleteConversation = vi.fn()
const parseFileContent = vi.fn()
const classifyReferenceFile = vi.fn()
const loggerError = vi.fn()

vi.mock('../src/lib/config', () => ({
  LLM_MARKDOWN_TIMEOUT: 1000,
  MAX_FILE_VERSIONS: 5,
  UPLOAD_PROGRESS_TTL: 1000
}))

vi.mock('../src/lib/ai/providers', () => ({
  getFastModel: () => ({
    invoke: vi.fn(async () => ({ content: '# 简历\n\n内容' }))
  })
}))

vi.mock('../src/lib/ai/prompts', () => ({
  buildResumeMarkdownPrompt: vi.fn(() => 'prompt')
}))

vi.mock('../src/lib/document/loader', () => ({
  DocumentLoader: class {
    chunks: { pageContent: string; metadata: Record<string, unknown> }[] = []

    async loadDocumentsFromText() {
      this.chunks = [{ pageContent: 'chunk', metadata: {} }]
    }
  }
}))

vi.mock('../src/storage/document/file-manager', () => ({
  addFileToConversation,
  cleanupOldVersions,
  updateDocumentRefSnapshot,
  addToUserLibrary
}))

vi.mock('../src/storage/user/user-documents', () => ({
  getUserDocsWithFiles
}))

vi.mock('../src/storage/repository', () => ({
  appendConversationChunks: vi.fn(),
  createConversation,
  deleteConversation,
  getConversationDocuments: vi.fn(),
  getConversationMessages: vi.fn(),
  getConversationTitle: vi.fn(),
  getDeletedUserConversations: vi.fn(),
  getLatestConversationResumeSnapshot: vi.fn(),
  getMessagesBefore: vi.fn(),
  getUserConversations: vi.fn(),
  isConversationOwner: vi.fn(),
  isConversationParticipant: vi.fn(),
  purgeExpiredDeletedConversations: vi.fn(),
  restoreConversationWithinTtl: vi.fn(),
  setConversationChunksWithTypes: vi.fn()
}))

vi.mock('../src/lib/file-content', () => ({
  assertSupportedUploadFile: vi.fn(),
  inferStoredFileType: vi.fn(() => 'txt'),
  parseFileContent
}))

vi.mock('../src/services/chat/classifier.service', () => ({
  classifyReferenceFile
}))

vi.mock('../src/lib/logger', () => ({
  logger: {
    error: loggerError
  }
}))

describe('startConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createConversation.mockResolvedValue(undefined)
    deleteConversation.mockResolvedValue(undefined)
    addFileToConversation.mockResolvedValue({ refId: 1, globalDocId: 2 })
    parseFileContent.mockResolvedValue('这不是简历')
    classifyReferenceFile.mockResolvedValue('job')
  })

  it('soft-deletes the conversation created for a failed start flow', async () => {
    const { startConversation } = await import('../src/services/document/conversation.service')

    await expect(
      startConversation(
        [
          {
            buffer: Buffer.from('not resume'),
            originalname: 'job.txt',
            mimetype: 'text/plain',
            size: 10
          }
        ],
        '请分析',
        'user-1',
        undefined,
        undefined,
        'conv-start-failed'
      )
    ).rejects.toThrow('上传文件不是简历')

    expect(createConversation).toHaveBeenCalledWith('conv-start-failed', 'user-1', '请分析')
    expect(deleteConversation).toHaveBeenCalledWith('conv-start-failed')
    expect(cleanupOldVersions).not.toHaveBeenCalled()
  })
})
