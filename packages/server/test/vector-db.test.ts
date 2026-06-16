import { beforeEach, describe, expect, it, vi } from 'vitest'

const add = vi.fn()
const connect = vi.fn()
const countRows = vi.fn()
const createIndex = vi.fn()
const createTable = vi.fn()
const deleteRows = vi.fn()
const dropTable = vi.fn()
const getEmbedding = vi.fn()
const ivfPq = vi.fn()
const loggerInfo = vi.fn()
const loggerWarn = vi.fn()
const limit = vi.fn()
const openTable = vi.fn()
const schema = vi.fn()
const search = vi.fn()
const tableNames = vi.fn()
const toArray = vi.fn()
const update = vi.fn()
const where = vi.fn()

const searchQuery = { where, limit, toArray }

vi.mock('@lancedb/lancedb', () => ({
  connect,
  Index: { ivfPq }
}))

vi.mock('../src/lib/ai/providers', () => ({
  getEmbedding
}))

vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: loggerInfo,
    warn: loggerWarn
  }
}))

describe('vector DB indexing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
    ivfPq.mockImplementation((options) => ({ type: 'ivfPq', options }))
    connect.mockResolvedValue({ tableNames, createTable, openTable, dropTable })
    createTable.mockResolvedValue({ countRows, createIndex })
    openTable.mockResolvedValue({
      add,
      countRows,
      createIndex,
      delete: deleteRows,
      schema,
      search,
      update
    })
    add.mockResolvedValue(undefined)
    createIndex.mockResolvedValue(undefined)
    deleteRows.mockResolvedValue(undefined)
    dropTable.mockResolvedValue(undefined)
    limit.mockReturnValue(searchQuery)
    schema.mockResolvedValue({
      fields: [
        { name: 'vector' },
        { name: 'text' },
        { name: 'systemDocId' },
        { name: 'active' },
        { name: 'groupId' },
        { name: 'groupName' },
        { name: 'contentFormat' }
      ]
    })
    search.mockReturnValue(searchQuery)
    toArray.mockResolvedValue([])
    update.mockResolvedValue({ rowsUpdated: 1, version: 2 })
    where.mockReturnValue(searchQuery)
  })

  it('skips PQ index creation when system RAG has too few rows', async () => {
    tableNames.mockResolvedValue([])
    countRows.mockResolvedValue(12)

    const { indexSystemDocumentChunks } = await import('../src/lib/document/vector-db')
    await indexSystemDocumentChunks(11, 1, 1, makeChunks(12), 'unknown', '默认')

    expect(createTable).toHaveBeenCalled()
    expect(createIndex).not.toHaveBeenCalled()
    expect(loggerInfo).toHaveBeenCalledWith(
      'Vector DB skipped PQ index creation; not enough rows',
      expect.objectContaining({ rowCount: 12, minRows: 256 })
    )
  })

  it('writes active and group metadata into system chunk rows', async () => {
    tableNames.mockResolvedValue([])
    countRows.mockResolvedValue(1)

    const { indexSystemDocumentChunks } = await import('../src/lib/document/vector-db')
    await indexSystemDocumentChunks(33, 3, 9, makeChunks(1), 'job', '岗位组', false)

    const rows = createTable.mock.calls[0]?.[1] as Record<string, unknown>[]
    expect(rows[0]).toMatchObject({
      systemDocId: 33,
      globalDocId: 3,
      groupId: 9,
      category: 'job',
      groupName: '岗位组',
      active: false,
      contentFormat: 'markdown'
    })
  })

  it('does not fail document indexing when optional PQ index creation fails', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    countRows.mockResolvedValue(300)
    createIndex.mockRejectedValue(new Error('not enough rows to train PQ'))

    const { indexSystemDocumentChunks } = await import('../src/lib/document/vector-db')
    await expect(
      indexSystemDocumentChunks(22, 2, 1, makeChunks(2), 'resume', '默认')
    ).resolves.toBe(undefined)

    expect(add).toHaveBeenCalled()
    expect(createIndex).toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      'Vector DB PQ index creation skipped after failure',
      expect.objectContaining({ rowCount: 300 })
    )
  })

  it('does not locally recreate stale system chunk table while indexing', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    countRows.mockResolvedValue(1)
    add.mockRejectedValue(new Error('Found field not in schema: active at row 0'))

    const { indexSystemDocumentChunks } = await import('../src/lib/document/vector-db')
    await expect(indexSystemDocumentChunks(44, 4, 2, makeChunks(1), 'job', '旧表')).rejects.toThrow(
      'Found field not in schema: active'
    )

    expect(add).toHaveBeenCalled()
    expect(dropTable).not.toHaveBeenCalled()
    expect(createTable).not.toHaveBeenCalled()
  })

  it('prefilters system search by active state and enabled group ids', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    toArray.mockResolvedValue([
      {
        text: '可用系统知识',
        _distance: 0.5,
        systemDocId: 7,
        globalDocId: 4,
        groupId: 3,
        chunkIndex: 2,
        category: 'resume',
        groupName: '启用分组'
      }
    ])

    const { searchSystemChunks } = await import('../src/lib/document/vector-db')
    const results = await searchSystemChunks('候选人经历', {
      k: 5,
      activeGroupIds: [3, 1, 3],
      category: 'resume'
    })

    expect(where).toHaveBeenCalledWith(
      "active = true AND groupId IN (3, 1) AND category = 'resume'"
    )
    expect(limit).toHaveBeenCalledWith(5)
    expect(results).toEqual([
      expect.objectContaining({
        text: '可用系统知识',
        systemDocId: 7,
        groupId: 3,
        category: 'resume'
      })
    ])
    expect(loggerInfo).toHaveBeenCalledWith(
      'Vector DB system chunk search hits',
      expect.objectContaining({
        returnedCount: 1,
        requestedK: 5,
        activeGroupCount: 2,
        hits: [
          expect.objectContaining({
            rank: 1,
            systemDocId: 7,
            globalDocId: 4,
            groupId: 3,
            groupName: '\\u542f\\u7528\\u5206\\u7ec4',
            category: 'resume',
            score: 0.8,
            chunkIndex: 2
          })
        ]
      })
    )
  })

  it('returns no system results without enabled groups before embedding search', async () => {
    const { searchSystemChunks } = await import('../src/lib/document/vector-db')
    await expect(searchSystemChunks('任意问题', { activeGroupIds: [] })).resolves.toEqual([])

    expect(getEmbedding).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it('fails system search when vector table schema is stale', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    schema.mockResolvedValue({ fields: [{ name: 'vector' }, { name: 'text' }] })

    const { searchSystemChunks } = await import('../src/lib/document/vector-db')
    await expect(searchSystemChunks('任意问题', { activeGroupIds: [1] })).rejects.toThrow(
      'System vector table schema is stale; rebuild required'
    )

    expect(getEmbedding).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it('updates active state for indexed system document chunks', async () => {
    tableNames.mockResolvedValue(['system_chunks'])

    const { updateSystemChunksActive } = await import('../src/lib/document/vector-db')
    await updateSystemChunksActive(42, false)

    expect(update).toHaveBeenCalledWith({
      where: 'systemDocId = 42',
      values: { active: false }
    })
  })

  it('fails active state updates when no vector rows are updated', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    update.mockResolvedValue({ rowsUpdated: 0, version: 2 })

    const { updateSystemChunksActive } = await import('../src/lib/document/vector-db')
    await expect(updateSystemChunksActive(42, true)).rejects.toThrow('reindex required')
  })

  it('detects old vector tables missing metadata columns', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    schema.mockResolvedValue({
      fields: [{ name: 'vector' }, { name: 'text' }]
    })

    const { systemVectorTableNeedsMetadataRebuild } = await import('../src/lib/document/vector-db')
    await expect(systemVectorTableNeedsMetadataRebuild()).resolves.toBe(true)
  })

  it('detects non-markdown legacy vector tables for rebuild', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    schema.mockResolvedValue({
      fields: [
        { name: 'vector' },
        { name: 'text' },
        { name: 'systemDocId' },
        { name: 'active' },
        { name: 'groupId' },
        { name: 'groupName' }
      ]
    })

    const { systemVectorTableNeedsMetadataRebuild } = await import('../src/lib/document/vector-db')
    await expect(systemVectorTableNeedsMetadataRebuild()).resolves.toBe(true)
  })

  it('updates group names for indexed system chunks by group id', async () => {
    tableNames.mockResolvedValue(['system_chunks'])
    update.mockResolvedValue({ rowsUpdated: 2, version: 3 })

    const { updateSystemChunksGroupName } = await import('../src/lib/document/vector-db')
    await expect(updateSystemChunksGroupName(9, '新分组')).resolves.toBe(2)

    expect(update).toHaveBeenCalledWith({
      where: 'groupId = 9',
      values: { groupName: '新分组' }
    })
  })
})

function makeChunks(count: number): { pageContent: string; chunkIndex: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    pageContent: `chunk ${index}`,
    chunkIndex: index
  }))
}
