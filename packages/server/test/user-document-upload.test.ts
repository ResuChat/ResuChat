import { beforeEach, describe, expect, it, vi } from 'vitest'

const addToUserLibrary = vi.fn()
const cancelUserDocumentParsing = vi.fn()
const deleteUserDocument = vi.fn()
const docParseQueueAdd = vi.fn()
const findUserDocumentByGlobalDoc = vi.fn()
const getDocumentRef = vi.fn()
const getDocumentRefForUser = vi.fn()
const getUserDocById = vi.fn()
const getUserDocFileInfo = vi.fn()
const listUserDocuments = vi.fn()
const markUserDocumentParsing = vi.fn()
const publishWsEvent = vi.fn()
const resetParsingUserDocuments = vi.fn()
const updateUserDocName = vi.fn()
const updateUserDocumentParseResult = vi.fn()
const uploadUserDocument = vi.fn()

vi.mock('../src/lib/ai/providers', () => ({
  getChatModel: vi.fn()
}))

vi.mock('../src/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('../src/lib/queue', () => ({
  docParseQueue: { add: docParseQueueAdd }
}))

vi.mock('../src/services/chat/classifier.service', () => ({
  classifyReferenceFile: vi.fn()
}))

vi.mock('../src/services/ws-events.service', () => ({
  publishWsEvent
}))

vi.mock('../src/storage/document/file-manager', () => ({
  getDocumentRef,
  getDocumentRefForUser
}))

vi.mock('../src/storage/user/user-documents', () => ({
  addToUserLibrary,
  cancelUserDocumentParsing,
  deleteUserDocument,
  findUserDocumentByGlobalDoc,
  getUserDocById,
  getUserDocFileInfo,
  listUserDocuments,
  markUserDocumentParsing,
  resetParsingUserDocuments,
  updateUserDocName,
  updateUserDocumentParseResult,
  uploadUserDocument
}))

describe('user document upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects legacy doc before creating a library record or queue job', async () => {
    const { uploadUserDocumentAndQueueParse } =
      await import('../src/services/document/user-documents.service')

    await expect(
      uploadUserDocumentAndQueueParse('user-1', Buffer.from('doc'), 'legacy.doc')
    ).rejects.toThrow('暂不支持旧版 .doc 文件')

    expect(uploadUserDocument).not.toHaveBeenCalled()
    expect(docParseQueueAdd).not.toHaveBeenCalled()
  })

  it('still queues supported docx uploads', async () => {
    uploadUserDocument.mockResolvedValue({
      id: 12,
      globalDocId: 34,
      filePath: 'uploads/documents/resume.docx',
      originalName: 'resume.docx'
    })
    docParseQueueAdd.mockResolvedValue({ id: 'job-1' })

    const { uploadUserDocumentAndQueueParse } =
      await import('../src/services/document/user-documents.service')

    await expect(
      uploadUserDocumentAndQueueParse('user-1', Buffer.from('docx'), 'resume.docx')
    ).resolves.toEqual({ id: 12, globalDocId: 34 })

    expect(uploadUserDocument).toHaveBeenCalledWith('user-1', Buffer.from('docx'), 'resume.docx')
    expect(docParseQueueAdd).toHaveBeenCalledWith('parse', {
      docId: 12,
      filePath: 'uploads/documents/resume.docx',
      originalName: 'resume.docx'
    })
  })
})
