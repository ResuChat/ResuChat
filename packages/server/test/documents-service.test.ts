import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocumentRef = vi.fn()
const isConversationDocumentOwner = vi.fn()
const removeFileFromConversation = vi.fn()
const setConversationChunksWithTypes = vi.fn()
const storeMessage = vi.fn()
const triggerAutoSummary = vi.fn()

vi.mock('../src/storage/document/file-manager', () => ({
  addFileToConversation: vi.fn(),
  cleanupOldVersions: vi.fn(),
  getConversationDocsByType: vi.fn(),
  getDocumentRef,
  removeFileFromConversation
}))

vi.mock('../src/storage/repository', () => ({
  isConversationDocumentOwner,
  setConversationChunksWithTypes,
  storeMessage
}))

vi.mock('../src/services/chat/summary.service', () => ({
  triggerAutoSummary
}))

vi.mock('../src/lib/document/loader', () => ({
  DocumentLoader: class {
    chunks: { pageContent: string; metadata: Record<string, unknown> }[] = []
    async loadDocumentsFromText(): Promise<void> {
      this.chunks = []
    }
  }
}))

vi.mock('../src/lib/pdf/pdfmaker', () => ({
  parseAIContent: vi.fn(),
  generateResumePDF: vi.fn()
}))

vi.mock('../src/lib/pdf/extractor', () => ({
  extractPdfText: vi.fn()
}))

describe('document service route-guard helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not delete a document ref from a different conversation', async () => {
    getDocumentRef.mockResolvedValue({
      id: 7,
      conversation_id: 'conv-other',
      file_path: 'resume.pdf',
      file_type: 'pdf',
      original_name: 'resume.pdf',
      content_snapshot: null,
      version: 1
    })

    const { deleteDocument } = await import('../src/services/document/documents.service')

    await expect(deleteDocument('conv-owner', 7)).rejects.toThrow('Access denied')

    expect(getDocumentRef).toHaveBeenCalledWith(7)
    expect(removeFileFromConversation).not.toHaveBeenCalled()
  })

  it('checks conversation document ownership from a route ref id', async () => {
    isConversationDocumentOwner.mockResolvedValue(true)

    const { isConversationDocumentOwnedByUser } =
      await import('../src/services/document/documents.service')

    await expect(isConversationDocumentOwnedByUser('7', 'user-1')).resolves.toBe(true)
    expect(isConversationDocumentOwner).toHaveBeenCalledWith(7, 'user-1')
  })

  it('rejects invalid route ref ids before checking document ownership', async () => {
    const { isConversationDocumentOwnedByUser } =
      await import('../src/services/document/documents.service')

    await expect(isConversationDocumentOwnedByUser('abc', 'user-1')).resolves.toBe(false)
    expect(isConversationDocumentOwner).not.toHaveBeenCalled()
  })
})
