import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const parseFileContent = vi.fn()
const assertSupportedUploadFile = vi.fn()
const inferStoredFileType = vi.fn()
const classifyReferenceFile = vi.fn()
const prepareConversationFile = vi.fn()
const insertConversationFileRef = vi.fn()
const appendConversationChunksInTransaction = vi.fn()
const syncChatReferenceToUserLibrary = vi.fn()
const getUserDocsWithFiles = vi.fn()
const dbTransaction = vi.fn()

vi.mock('../src/lib/file-content', () => ({
  assertSupportedUploadFile,
  parseFileContent,
  inferStoredFileType
}))

vi.mock('../src/services/chat/classifier.service', () => ({
  classifyReferenceFile
}))

vi.mock('../src/lib/document/loader', () => ({
  DocumentLoader: class {
    chunks: { pageContent: string; metadata: Record<string, unknown> }[] = []

    async loadDocumentsFromText() {
      this.chunks = [{ pageContent: 'reference chunk', metadata: { source: 'ref.pdf' } }]
    }
  }
}))

vi.mock('../src/storage/document/file-manager', () => ({
  prepareConversationFile,
  insertConversationFileRef
}))

vi.mock('../src/storage/user/user-documents', () => ({
  getUserDocsWithFiles
}))

vi.mock('../src/storage/repository', () => ({
  appendConversationChunksInTransaction
}))

vi.mock('../src/services/document/user-documents.service', () => ({
  syncChatReferenceToUserLibrary
}))

vi.mock('../src/lib/db', () => ({
  db: {
    transaction: dbTransaction
  }
}))

vi.mock('../src/lib/logger', () => ({
  logger: {
    error: vi.fn()
  }
}))

describe('processFileAsReference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    parseFileContent.mockResolvedValue('reference content')
    assertSupportedUploadFile.mockReturnValue(undefined)
    inferStoredFileType.mockReturnValue('pdf')
    classifyReferenceFile.mockResolvedValue('job')
    insertConversationFileRef.mockResolvedValue({ refId: 11, globalDocId: 22 })
    appendConversationChunksInTransaction.mockResolvedValue(undefined)
    dbTransaction.mockImplementation(async (callback) => callback({ tx: true }))
  })

  it('keeps reference ref and chunks in one transaction before syncing to user library', async () => {
    prepareConversationFile.mockReturnValue({
      fileHash: 'hash',
      fileSize: 3,
      filePath: 'ref.pdf',
      isNewPhysicalFile: false
    })

    const { processFileAsReference } = await import('../src/services/chat/file-processor.service')
    const result = await processFileAsReference({
      file: {
        buffer: Buffer.from('pdf'),
        originalname: 'ref.pdf',
        mimetype: 'application/pdf',
        size: 3
      },
      conversationId: 'conv-1',
      processedHashes: new Set(),
      syncToUserLibrary: true,
      userId: 'user-1'
    })

    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(insertConversationFileRef).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({ conversationId: 'conv-1', role: 'reference' })
    )
    expect(appendConversationChunksInTransaction).toHaveBeenCalledWith(
      { tx: true },
      'conv-1',
      expect.arrayContaining([
        expect.objectContaining({ role: 'reference', category: 'job', scope: 'conversation' })
      ]),
      11
    )
    expect(syncChatReferenceToUserLibrary).toHaveBeenCalledWith(
      'user-1',
      'conv-1',
      22,
      'ref.pdf',
      expect.any(Buffer)
    )
    expect(result?.refId).toBe(11)
  })

  it('cleans the prepared file and does not sync when chunk append fails', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resuchat-reference-'))
    const tempFile = path.join(tempDir, 'orphan.pdf')
    fs.writeFileSync(tempFile, 'pdf')
    prepareConversationFile.mockReturnValue({
      fileHash: 'hash',
      fileSize: 3,
      filePath: tempFile,
      isNewPhysicalFile: true
    })
    appendConversationChunksInTransaction.mockRejectedValue(new Error('append failed'))

    const { processFileAsReference } = await import('../src/services/chat/file-processor.service')
    await expect(
      processFileAsReference({
        file: {
          buffer: Buffer.from('pdf'),
          originalname: 'ref.pdf',
          mimetype: 'application/pdf',
          size: 3
        },
        conversationId: 'conv-1',
        processedHashes: new Set(),
        syncToUserLibrary: true,
        userId: 'user-1'
      })
    ).rejects.toThrow('append failed')

    expect(fs.existsSync(tempFile)).toBe(false)
    expect(syncChatReferenceToUserLibrary).not.toHaveBeenCalled()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('loads user documents in one batch and keeps input order', async () => {
    prepareConversationFile.mockReturnValue({
      fileHash: 'hash',
      fileSize: 3,
      filePath: 'ref.pdf',
      isNewPhysicalFile: false
    })
    insertConversationFileRef
      .mockResolvedValueOnce({ refId: 21, globalDocId: 31 })
      .mockResolvedValueOnce({ refId: 22, globalDocId: 32 })
    getUserDocsWithFiles.mockResolvedValue(
      new Map([
        [
          1,
          {
            buffer: Buffer.from('doc-one'),
            originalName: 'one.pdf',
            localName: '文档一',
            fileType: 'pdf',
            markdown: 'content one',
            contentCategory: 'resume'
          }
        ],
        [
          2,
          {
            buffer: Buffer.from('doc-two'),
            originalName: 'two.pdf',
            localName: '文档二',
            fileType: 'pdf',
            markdown: 'content two',
            contentCategory: 'job'
          }
        ]
      ])
    )

    const { processDocIdsAsReference } = await import('../src/services/chat/file-processor.service')
    const results = await processDocIdsAsReference(
      [2, 99, 1],
      'user-1',
      'conv-1',
      new Set()
    )

    expect(getUserDocsWithFiles).toHaveBeenCalledTimes(1)
    expect(getUserDocsWithFiles).toHaveBeenCalledWith('user-1', [2, 99, 1])
    expect(results).toHaveLength(2)
    expect(results.map((result) => result.attachment.docId)).toEqual([2, 1])
    expect(results.map((result) => result.attachment.name)).toEqual(['文档二', '文档一'])
  })
})
