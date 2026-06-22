import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writer = { merge: vi.fn() }

type ApplyStream = { execute: (args: { writer: typeof writer }) => Promise<void> }
type TestTx = { tx: true }

const createUIMessageStream = vi.fn((options: ApplyStream) => options)
const getConversationChunksWithTypes = vi.fn()
const setConversationChunksWithTypesInTransaction = vi.fn()
const storeMessageInTransaction = vi.fn()
const prepareConversationFile = vi.fn()
const insertConversationFileRef = vi.fn()
const cleanupOldVersionsInTransaction = vi.fn()
const dbTransaction = vi.fn()
const triggerAutoSummary = vi.fn()
const tryReplaceText = vi.fn<
  (fullText: string, current: string, newContent: string) => string | null
>(() => '修改后的完整简历')

function asApplyStream(stream: unknown): ApplyStream {
  return stream as ApplyStream
}

vi.mock('ai', () => ({
  createUIMessageStream
}))

vi.mock('../src/lib/db', () => ({
  db: {
    transaction: dbTransaction
  }
}))

vi.mock('../src/lib/ai/providers', () => ({
  getChatModel: () => ({
    invoke: vi.fn(async () => ({ content: '替换后的内容' }))
  })
}))

vi.mock('../src/lib/ai/prompts', () => ({
  buildApplyPrompt: vi.fn(async () => 'apply prompt'),
  buildAcceptPrompt: vi.fn(async () => 'accept prompt')
}))

vi.mock('../src/lib/pdf/pdfmaker', () => ({
  parseResumeSections: vi.fn(() => []),
  sectionsToContentArray: vi.fn(() => []),
  generateResumePDF: vi.fn(async () => Buffer.from('pdf'))
}))

vi.mock('../src/lib/pdf/markdown', () => ({
  tryReplaceText
}))

vi.mock('../src/lib/document/loader', () => ({
  DocumentLoader: class {
    chunks: { pageContent: string; metadata: Record<string, unknown> }[] = []

    async loadDocumentsFromText() {
      this.chunks = [{ pageContent: 'chunk', metadata: { source: 'updated' } }]
    }
  }
}))

vi.mock('../src/storage/document/file-manager', () => ({
  getConversationDocsByType: vi.fn(),
  prepareConversationFile,
  insertConversationFileRef,
  cleanupOldVersionsInTransaction
}))

vi.mock('../src/storage/repository', () => ({
  getConversationChunksWithTypes,
  setConversationChunksWithTypesInTransaction,
  storeMessageInTransaction
}))

vi.mock('../src/services/chat/summary.service', () => ({
  triggerAutoSummary
}))

vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn()
  }
}))

describe('createApplyStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConversationChunksWithTypes.mockResolvedValue([
      { pageContent: '原文', metadata: {}, role: 'original', category: 'resume' }
    ])
    insertConversationFileRef.mockResolvedValue({
      refId: 42,
      globalDocId: 7,
      filePath: 'modified.pdf',
      isNewFile: true,
      version: 1,
      category: 'resume'
    })
    cleanupOldVersionsInTransaction.mockResolvedValue([])
    setConversationChunksWithTypesInTransaction.mockResolvedValue(undefined)
    storeMessageInTransaction.mockResolvedValue(undefined)
    dbTransaction.mockImplementation(async (callback: (tx: TestTx) => unknown) =>
      callback({ tx: true })
    )
    tryReplaceText.mockReturnValue('修改后的完整简历')
  })

  it('cleans the prepared file and does not emit tool output when the db transaction fails', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resuchat-modify-'))
    const tempFile = path.join(tempDir, 'orphan.pdf')
    fs.writeFileSync(tempFile, 'pdf')
    prepareConversationFile.mockReturnValue({
      fileHash: 'hash',
      fileSize: 3,
      filePath: tempFile,
      isNewPhysicalFile: true
    })
    setConversationChunksWithTypesInTransaction.mockRejectedValue(new Error('chunk failed'))

    const { createApplyStream } = await import('../src/services/document/modify.service')
    const stream = asApplyStream(
      createApplyStream({
        conversationId: 'conv-1',
        optimization: {
          field: '项目经验',
          current: '原文',
          suggestion: '建议'
        },
        clientIds: { user: 'user-msg', processing: 'processing-msg' },
        assistantMsgId: 'assistant-msg'
      })
    )

    await expect(stream.execute({ writer })).rejects.toThrow('chunk failed')

    expect(fs.existsSync(tempFile)).toBe(false)
    expect(storeMessageInTransaction).not.toHaveBeenCalled()
    expect(writer.merge).not.toHaveBeenCalled()
    expect(triggerAutoSummary).not.toHaveBeenCalled()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('writes file ref, chunks and messages in one transaction before emitting tool output', async () => {
    prepareConversationFile.mockReturnValue({
      fileHash: 'hash',
      fileSize: 3,
      filePath: 'modified.pdf',
      isNewPhysicalFile: false
    })

    const { createApplyStream } = await import('../src/services/document/modify.service')
    const stream = asApplyStream(
      createApplyStream({
        conversationId: 'conv-1',
        optimization: {
          field: '项目经验',
          current: '原文',
          suggestion: '建议'
        },
        clientIds: { user: 'user-msg', processing: 'processing-msg' },
        assistantMsgId: 'assistant-msg'
      })
    )

    await stream.execute({ writer })

    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(insertConversationFileRef).toHaveBeenCalled()
    expect(setConversationChunksWithTypesInTransaction).toHaveBeenCalledWith(
      { tx: true },
      'conv-1',
      [
        {
          pageContent: 'chunk',
          metadata: { source: 'updated' },
          role: 'modified',
          category: 'resume'
        }
      ],
      42
    )
    expect(storeMessageInTransaction).toHaveBeenCalledTimes(3)
    expect(writer.merge).toHaveBeenCalledTimes(1)
    expect(triggerAutoSummary).toHaveBeenCalledWith('conv-1')
  })

  it('fails before generating pdf when the source text cannot be located', async () => {
    tryReplaceText.mockReturnValue(null)

    const { createApplyStream } = await import('../src/services/document/modify.service')
    const stream = asApplyStream(
      createApplyStream({
        conversationId: 'conv-1',
        optimization: {
          field: '项目经验',
          current: '不存在的原文',
          suggestion: '建议'
        },
        clientIds: { user: 'user-msg', processing: 'processing-msg' },
        assistantMsgId: 'assistant-msg'
      })
    )

    await expect(stream.execute({ writer })).rejects.toThrow('未能在当前简历中定位到要修改的原文')

    expect(prepareConversationFile).not.toHaveBeenCalled()
    expect(dbTransaction).not.toHaveBeenCalled()
    expect(storeMessageInTransaction).not.toHaveBeenCalled()
    expect(writer.merge).not.toHaveBeenCalled()
    expect(triggerAutoSummary).not.toHaveBeenCalled()
  })
})
