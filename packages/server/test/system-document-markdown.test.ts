import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createGlobalDocument = vi.fn()
const createSystemDocument = vi.fn()
const deleteGlobalDocument = vi.fn()
const deleteGroup = vi.fn()
const deleteSystemChunks = vi.fn()
const deleteSystemDocRecord = vi.fn()
const findGlobalDocByHash = vi.fn()
const findSystemDocByGlobalDocAndGroup = vi.fn()
const findSystemDocById = vi.fn()
const getFastModel = vi.fn()
const getGlobalDocRefCount = vi.fn()
const getSystemDocumentById = vi.fn()
const getSystemDocumentGroup = vi.fn()
const getSystemDocumentIndexTarget = vi.fn()
const indexSystemDocumentChunks = vi.fn()
const invoke = vi.fn()
const isSystemVectorTableSchemaStaleError = vi.fn()
const listGroups = vi.fn()
const listSystemDocs = vi.fn()
const loadDocumentsFromText = vi.fn()
const parseFileContent = vi.fn()
const assertSupportedUploadFile = vi.fn()
const publishWsEvent = vi.fn()
const queueAdd = vi.fn()
const requeueSystemDocument = vi.fn()
const updateDocActive = vi.fn()
const updateGroup = vi.fn()
const updateSystemChunksActive = vi.fn()
const updateSystemChunksGroupName = vi.fn()
const updateSystemDocumentsGroupName = vi.fn()
const updateSystemDocumentIndexState = vi.fn()

class MockDocumentLoader {
  chunks: { pageContent: string; metadata: Record<string, unknown> }[] = []

  async loadDocumentsFromText(
    docs: { text: string; metadata?: Record<string, unknown> }[]
  ): Promise<void> {
    loadDocumentsFromText(docs)
    this.chunks = docs.map((doc) => ({
      pageContent: doc.text,
      metadata: doc.metadata ?? {}
    }))
  }
}

vi.mock('../src/lib/ai/providers', () => ({
  getFastModel
}))

vi.mock('../src/lib/document/loader', () => ({
  DocumentLoader: MockDocumentLoader
}))

vi.mock('../src/lib/document/vector-db', () => ({
  deleteSystemChunks,
  indexSystemDocumentChunks,
  isSystemVectorTableSchemaStaleError,
  updateSystemChunksActive,
  updateSystemChunksGroupName
}))

vi.mock('../src/lib/file-content', () => ({
  assertSupportedUploadFile,
  parseFileContent
}))

vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('../src/lib/queue', () => ({
  systemDocIndexQueue: { add: queueAdd }
}))

vi.mock('../src/services/ws-events.service', () => ({
  publishWsEvent
}))

vi.mock('../src/storage/document/file-manager', () => ({
  countSystemDocumentGroupChildren: vi.fn(),
  countSystemDocumentsInGroup: vi.fn(),
  createGlobalDocument,
  createSystemDocument,
  createSystemDocumentGroup: vi.fn(),
  deleteGlobalDocument,
  deleteSystemDocument: deleteSystemDocRecord,
  deleteSystemDocumentGroup: deleteGroup,
  ensureDefaultSystemDocumentGroup: vi.fn(),
  findGlobalDocByHash,
  findSystemDocByGlobalDocAndGroup,
  findSystemDocById,
  getGlobalDocRefCount,
  getSystemDocumentById,
  getSystemDocumentGroup,
  getSystemDocumentIndexTarget,
  listSystemDocumentGroups: listGroups,
  listSystemDocuments: listSystemDocs,
  requeueSystemDocument,
  setSystemDocumentGroupsActive: vi.fn(),
  updateSystemDocumentActive: updateDocActive,
  updateSystemDocumentsGroupName,
  updateSystemDocumentGroup: updateGroup,
  updateSystemDocumentIndexState
}))

describe('system document markdown indexing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getFastModel.mockReturnValue({ invoke })
    parseFileContent.mockResolvedValue(
      '岗位职责：负责 RAG 检索、系统知识库索引、向量召回质量优化，并维护异步文档处理流程。任职要求：熟悉 TypeScript、PostgreSQL、LanceDB、BullMQ 和后端工程实践，能够处理长文档解析与结构化。'
    )
    invoke.mockResolvedValueOnce({ content: '{"category":"job"}' }).mockResolvedValueOnce({
      content:
        '```markdown\n## 岗位职责\n- 负责 RAG 检索。\n\n## 任职要求\n- 熟悉 TypeScript 和 PostgreSQL。\n```'
    })
    deleteSystemChunks.mockResolvedValue(undefined)
    indexSystemDocumentChunks.mockResolvedValue(undefined)
    listSystemDocs.mockResolvedValue([])
    publishWsEvent.mockResolvedValue(undefined)
    queueAdd.mockResolvedValue({ id: 'job-1' })
    isSystemVectorTableSchemaStaleError.mockReturnValue(false)
    updateSystemDocumentIndexState.mockResolvedValue(undefined)
    updateSystemChunksGroupName.mockResolvedValue(0)
    updateSystemDocumentsGroupName.mockResolvedValue(0)
  })

  it('formats system document text as markdown before splitting and vector indexing', async () => {
    const tempFile = path.join(os.tmpdir(), `resuchat-system-md-${Date.now()}.txt`)
    fs.writeFileSync(tempFile, 'placeholder')
    getSystemDocumentIndexTarget.mockResolvedValue({
      id: 12,
      globalDocId: 34,
      groupId: 5,
      groupName: '岗位资料',
      localName: 'jd.txt',
      filePath: tempFile,
      originalName: 'jd.txt',
      fileType: 'txt',
      fileSize: 128,
      active: true
    })

    const { processSystemDocumentIndexing } = await import('../src/services/document/admin.service')
    await processSystemDocumentIndexing(12)

    expect(loadDocumentsFromText).toHaveBeenCalledWith([
      {
        text: '## 岗位职责\n- 负责 RAG 检索。\n\n## 任职要求\n- 熟悉 TypeScript 和 PostgreSQL。',
        metadata: {
          source: 'jd.txt',
          file_type: 'system',
          group_id: 5,
          group_name: '岗位资料',
          category: 'job'
        }
      }
    ])
    expect(indexSystemDocumentChunks).toHaveBeenCalledWith(
      12,
      34,
      5,
      [
        {
          pageContent:
            '## 岗位职责\n- 负责 RAG 检索。\n\n## 任职要求\n- 熟悉 TypeScript 和 PostgreSQL。',
          chunkIndex: 0
        }
      ],
      'job',
      '岗位资料',
      true
    )

    fs.rmSync(tempFile, { force: true })
  })

  it('rejects legacy doc uploads before creating system document records', async () => {
    assertSupportedUploadFile.mockImplementationOnce(() => {
      throw new Error('暂不支持旧版 .doc 文件')
    })

    const { uploadSystemDocument } = await import('../src/services/document/admin.service')

    await expect(uploadSystemDocument(Buffer.from('doc'), 'legacy.doc', 1)).rejects.toThrow(
      '暂不支持旧版 .doc 文件'
    )

    expect(getSystemDocumentGroup).not.toHaveBeenCalled()
    expect(createGlobalDocument).not.toHaveBeenCalled()
    expect(createSystemDocument).not.toHaveBeenCalled()
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('marks the document failed when stale schema is detected during vector indexing', async () => {
    const tempFile = path.join(os.tmpdir(), `resuchat-system-md-${Date.now()}-write-stale.txt`)
    fs.writeFileSync(tempFile, 'placeholder')
    getSystemDocumentIndexTarget.mockResolvedValue({
      id: 12,
      globalDocId: 34,
      groupId: 5,
      groupName: '岗位资料',
      localName: 'jd.txt',
      filePath: tempFile,
      originalName: 'jd.txt',
      fileType: 'txt',
      fileSize: 128,
      active: true
    })
    indexSystemDocumentChunks.mockRejectedValue(new Error('Found field not in schema: active'))
    isSystemVectorTableSchemaStaleError.mockReturnValue(true)

    const { processSystemDocumentIndexing } = await import('../src/services/document/admin.service')
    await expect(processSystemDocumentIndexing(12)).rejects.toThrow('系统向量库 schema 过旧')

    expect(updateSystemDocumentIndexState).toHaveBeenCalledWith(12, {
      status: 'indexing',
      errorMessage: null
    })
    expect(updateSystemDocumentIndexState).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('vector:rebuild-system')
      })
    )
    expect(publishWsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          type: 'system_doc_index_changed',
          payload: expect.objectContaining({
            systemDocId: 12,
            status: 'failed',
            errorMessage: expect.stringContaining('vector:rebuild-system')
          })
        })
      })
    )
    expect(queueAdd).not.toHaveBeenCalled()

    fs.rmSync(tempFile, { force: true })
  })

  it('requeues pending and indexing system documents with clean index metadata', async () => {
    listSystemDocs.mockResolvedValue([
      {
        id: 12,
        global_doc_id: 34,
        group_id: 5,
        category: 'job',
        group_name: '岗位资料',
        local_name: 'jd.txt',
        active: true,
        index_status: 'pending',
        error_message: 'old error',
        chunks_count: 4,
        indexed_at: 2,
        created_at: 1,
        updated_at: 2,
        file_type: 'txt',
        file_size: 128,
        original_name: 'jd.txt'
      },
      {
        id: 21,
        global_doc_id: 35,
        group_id: 6,
        category: 'resume',
        group_name: '简历资料',
        local_name: 'resume.pdf',
        active: true,
        index_status: 'indexing',
        error_message: null,
        chunks_count: 8,
        indexed_at: 3,
        created_at: 1,
        updated_at: 3,
        file_type: 'pdf',
        file_size: 256,
        original_name: 'resume.pdf'
      },
      {
        id: 33,
        global_doc_id: 36,
        group_id: 7,
        category: 'unknown',
        group_name: '其他资料',
        local_name: 'done.txt',
        active: true,
        index_status: 'done',
        error_message: null,
        chunks_count: 2,
        indexed_at: 4,
        created_at: 1,
        updated_at: 4,
        file_type: 'txt',
        file_size: 64,
        original_name: 'done.txt'
      }
    ])

    const { requeuePendingSystemDocumentIndexing } =
      await import('../src/services/document/admin.service')
    const count = await requeuePendingSystemDocumentIndexing()

    expect(count).toBe(2)
    expect(updateSystemDocumentIndexState).toHaveBeenCalledWith(12, {
      status: 'pending',
      chunksCount: 0,
      errorMessage: null,
      indexedAt: null
    })
    expect(updateSystemDocumentIndexState).toHaveBeenCalledWith(21, {
      status: 'pending',
      chunksCount: 0,
      errorMessage: null,
      indexedAt: null
    })
    expect(updateSystemDocumentIndexState).not.toHaveBeenCalledWith(33, expect.any(Object))
    expect(queueAdd).toHaveBeenCalledWith('index', { systemDocId: 12 })
    expect(queueAdd).toHaveBeenCalledWith('index', { systemDocId: 21 })
    expect(queueAdd).not.toHaveBeenCalledWith('index', { systemDocId: 33 })
  })

  it('disables vector chunks before marking a system document inactive in db', async () => {
    getSystemDocumentById.mockResolvedValue({
      id: 12,
      active: true,
      index_status: 'done',
      chunks_count: 3
    })
    updateSystemChunksActive.mockResolvedValue(undefined)
    updateDocActive.mockResolvedValue(1)

    const { updateSystemDocumentActive } = await import('../src/services/document/admin.service')
    await expect(updateSystemDocumentActive(12, false)).resolves.toEqual({
      id: 12,
      active: false
    })

    expect(updateSystemChunksActive).toHaveBeenCalledWith(12, false)
    expect(updateDocActive).toHaveBeenCalledWith(12, false)
    expect(updateSystemChunksActive.mock.invocationCallOrder[0]).toBeLessThan(
      updateDocActive.mock.invocationCallOrder[0]
    )
  })

  it('still disables system document in db when vector rows are already missing', async () => {
    getSystemDocumentById.mockResolvedValue({
      id: 12,
      active: true,
      index_status: 'done',
      chunks_count: 3
    })
    updateSystemChunksActive.mockRejectedValue(
      new Error('System vector table is missing; reindex required')
    )
    updateDocActive.mockResolvedValue(1)

    const { updateSystemDocumentActive } = await import('../src/services/document/admin.service')
    await expect(updateSystemDocumentActive(12, false)).resolves.toEqual({
      id: 12,
      active: false
    })

    expect(updateSystemChunksActive).toHaveBeenCalledWith(12, false)
    expect(updateDocActive).toHaveBeenCalledWith(12, false)
  })

  it('rolls back db active state when enabling vector chunks fails', async () => {
    const error = new Error('lance write failed')
    getSystemDocumentById.mockResolvedValue({
      id: 12,
      active: false,
      index_status: 'done',
      chunks_count: 3
    })
    updateDocActive.mockResolvedValue(1)
    updateSystemChunksActive.mockRejectedValue(error)

    const { updateSystemDocumentActive } = await import('../src/services/document/admin.service')
    await expect(updateSystemDocumentActive(12, true)).rejects.toThrow('lance write failed')

    expect(updateDocActive).toHaveBeenNthCalledWith(1, 12, true)
    expect(updateSystemChunksActive).toHaveBeenCalledWith(12, true)
    expect(updateDocActive).toHaveBeenNthCalledWith(2, 12, false)
  })

  it('syncs renamed system group names to documents and vector metadata', async () => {
    getSystemDocumentGroup.mockResolvedValue({
      id: 5,
      parent_id: null,
      name: '旧分组',
      active: true,
      document_count: 2,
      created_at: 1,
      updated_at: 1
    })
    listGroups.mockResolvedValue([
      {
        id: 5,
        parent_id: null,
        name: '旧分组',
        active: true,
        document_count: 2,
        created_at: 1,
        updated_at: 1
      }
    ])
    updateGroup.mockResolvedValue({
      id: 5,
      parent_id: null,
      name: '新分组',
      active: true,
      document_count: 2,
      created_at: 1,
      updated_at: 2
    })
    updateSystemDocumentsGroupName.mockResolvedValue(2)
    updateSystemChunksGroupName.mockResolvedValue(3)

    const { updateSystemGroup } = await import('../src/services/document/admin.service')
    await expect(updateSystemGroup(5, { name: '新分组' })).resolves.toMatchObject({
      id: 5,
      name: '新分组'
    })

    expect(updateSystemDocumentsGroupName).toHaveBeenCalledWith(5, '新分组')
    expect(updateSystemChunksGroupName).toHaveBeenCalledWith(5, '新分组')
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('keeps group rename in db and does not queue rebuild when vector schema is stale', async () => {
    getSystemDocumentGroup.mockResolvedValue({
      id: 5,
      parent_id: null,
      name: '旧分组',
      active: true,
      document_count: 2,
      created_at: 1,
      updated_at: 1
    })
    listGroups.mockResolvedValue([
      {
        id: 5,
        parent_id: null,
        name: '旧分组',
        active: true,
        document_count: 2,
        created_at: 1,
        updated_at: 1
      }
    ])
    updateGroup.mockResolvedValue({
      id: 5,
      parent_id: null,
      name: '新分组',
      active: true,
      document_count: 2,
      created_at: 1,
      updated_at: 2
    })
    updateSystemChunksGroupName.mockRejectedValue(new Error('Found field not in schema: groupName'))
    isSystemVectorTableSchemaStaleError.mockReturnValue(true)

    const { updateSystemGroup } = await import('../src/services/document/admin.service')
    await expect(updateSystemGroup(5, { name: '新分组' })).resolves.toMatchObject({
      id: 5,
      name: '新分组'
    })

    expect(updateSystemDocumentsGroupName).toHaveBeenCalledWith(5, '新分组')
    expect(queueAdd).not.toHaveBeenCalled()
  })
})
