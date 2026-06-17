import * as lancedb from '@lancedb/lancedb'
import pLimit from 'p-limit'
import { getEmbedding } from '../ai/providers'
import { VECTOR_DB_PATH, VECTOR_DB_TABLE, VECTOR_SEARCH_K } from '../config'
import { logger } from '../logger'

let db: lancedb.Connection | null = null
const DEFAULT_EMBED_BATCH_CONCURRENCY = 4
const MAX_EMBED_BATCH_CONCURRENCY = 16
const MIN_ROWS_FOR_PQ_INDEX = 256
const SYSTEM_CHUNK_CONTENT_FORMAT = 'markdown'
const REQUIRED_SYSTEM_CHUNK_FIELDS = [
  'systemDocId',
  'active',
  'groupId',
  'groupName',
  'contentFormat'
] as const

export class SystemVectorTableSchemaStaleError extends Error {
  readonly missingFields: string[]

  constructor(missingFields: readonly string[]) {
    super(
      `System vector table schema is stale; rebuild required. Missing fields: ${missingFields.join(
        ', '
      )}`
    )
    this.name = 'SystemVectorTableSchemaStaleError'
    this.missingFields = [...missingFields]
  }
}

type SearchSystemChunksOptions = {
  k?: number
  category?: string
  activeGroupIds?: number[]
}

type NormalizedSystemChunkRow = {
  text: string
  distance: number
  systemDocId: number
  globalDocId: number
  groupId: number | null
  chunkIndex?: number
  category: string
  groupName: string
}

async function getDb(): Promise<lancedb.Connection> {
  if (!db) db = await lancedb.connect(VECTOR_DB_PATH)
  return db
}

async function embed(text: string): Promise<number[]> {
  return getEmbedding(text)
}

export function resolveEmbedBatchConcurrency(value = process.env.EMBED_BATCH_CONCURRENCY): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_EMBED_BATCH_CONCURRENCY
  return Math.min(parsed, MAX_EMBED_BATCH_CONCURRENCY)
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const limit = pLimit(resolveEmbedBatchConcurrency())
  return Promise.all(texts.map((text) => limit(() => embed(text))))
}

async function maybeCreateVectorIndex(table: lancedb.Table): Promise<void> {
  const rowCount = await table.countRows()
  if (rowCount < MIN_ROWS_FOR_PQ_INDEX) {
    logger.info('Vector DB skipped PQ index creation; not enough rows', {
      rowCount,
      minRows: MIN_ROWS_FOR_PQ_INDEX
    })
    return
  }

  const numPartitions = Math.max(2, Math.ceil(Math.sqrt(rowCount)))
  const sampleRate = Math.max(1, Math.floor(rowCount / numPartitions))

  try {
    await table.createIndex('vector', {
      replace: true,
      waitTimeoutSeconds: 60,
      config: lancedb.Index.ivfPq({ numPartitions, sampleRate })
    })
    logger.info('Vector DB PQ index created', { rowCount, numPartitions, sampleRate })
  } catch (error) {
    logger.warn('Vector DB PQ index creation skipped after failure', { rowCount, error })
  }
}

async function openSystemChunksTable(): Promise<lancedb.Table | null> {
  const conn = await getDb()
  const tableNames = await conn.tableNames()
  if (!tableNames.includes(VECTOR_DB_TABLE)) return null
  return await conn.openTable(VECTOR_DB_TABLE)
}

async function getSystemVectorMetadataState(
  table: lancedb.Table
): Promise<{ ready: boolean; missingFields: string[] }> {
  const tableSchema = await table.schema()
  const fieldNames = new Set(tableSchema.fields.map((field) => field.name))
  const missingFields = REQUIRED_SYSTEM_CHUNK_FIELDS.filter((field) => !fieldNames.has(field))
  return { ready: missingFields.length === 0, missingFields }
}

async function assertSystemVectorMetadataReady(table: lancedb.Table): Promise<void> {
  const metadataState = await getSystemVectorMetadataState(table)
  if (!metadataState.ready) {
    throw new SystemVectorTableSchemaStaleError(metadataState.missingFields)
  }
}

export function isSystemVectorTableSchemaStaleError(error: unknown): boolean {
  if (error instanceof SystemVectorTableSchemaStaleError) return true
  if (!(error instanceof Error)) return false

  return (
    error.message.includes('System vector table schema is stale') ||
    (error.message.includes('Found field not in schema') &&
      REQUIRED_SYSTEM_CHUNK_FIELDS.some((field) => error.message.includes(field))) ||
    (error.message.includes('No field named') &&
      REQUIRED_SYSTEM_CHUNK_FIELDS.some((field) => error.message.includes(field)))
  )
}

function normalizeIds(ids: number[]): number[] {
  return Array.from(
    new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
  )
}

export function normalizeSystemChunkRow(row: unknown): NormalizedSystemChunkRow | null {
  if (!row || typeof row !== 'object') {
    logger.warn('Vector DB ignored invalid system chunk row', { reason: 'not_object' })
    return null
  }

  const raw = row as Record<string, unknown>
  const text = typeof raw.text === 'string' ? raw.text : undefined
  const systemDocId = toPositiveInteger(raw.systemDocId)
  const globalDocId = toPositiveInteger(raw.globalDocId)

  if (!text || !systemDocId || !globalDocId) {
    logger.warn('Vector DB ignored invalid system chunk row', {
      reason: 'missing_required_fields',
      hasText: typeof raw.text === 'string',
      systemDocId: raw.systemDocId,
      globalDocId: raw.globalDocId
    })
    return null
  }

  const distance = Number(raw._distance ?? 0)
  return {
    text,
    distance: Number.isFinite(distance) ? distance : 0,
    systemDocId,
    globalDocId,
    groupId:
      raw.groupId === null || raw.groupId === undefined ? null : toIntegerOrNull(raw.groupId),
    chunkIndex:
      raw.chunkIndex === null || raw.chunkIndex === undefined
        ? undefined
        : toIntegerOrUndefined(raw.chunkIndex),
    category: typeof raw.category === 'string' ? raw.category : '',
    groupName: typeof raw.groupName === 'string' ? raw.groupName : ''
  }
}

function toPositiveInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined
}

function toIntegerOrNull(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? numberValue : null
}

function toIntegerOrUndefined(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? numberValue : undefined
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function asciiLogText(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}

function buildSystemChunkFilter(options: SearchSystemChunksOptions): string {
  const parts = ['active = true']

  if (options.activeGroupIds !== undefined) {
    const groupIds = normalizeIds(options.activeGroupIds)
    if (groupIds.length === 0) return 'false'
    parts.push(`groupId IN (${groupIds.join(', ')})`)
  }

  if (options.category) {
    parts.push(`category = ${sqlStringLiteral(options.category)}`)
  }

  return parts.join(' AND ')
}

export async function indexSystemDocumentChunks(
  systemDocId: number,
  globalDocId: number,
  groupId: number | null,
  chunks: { pageContent: string; chunkIndex: number }[],
  category: string,
  groupName: string,
  active = true
): Promise<void> {
  if (chunks.length === 0) return

  const texts = chunks.map((c) => c.pageContent)
  const vectors = await embedBatch(texts)

  const conn = await getDb()
  const data = chunks.map((c, i) => ({
    vector: vectors[i],
    text: c.pageContent,
    systemDocId,
    globalDocId: globalDocId,
    groupId,
    chunkIndex: c.chunkIndex,
    category,
    groupName,
    active,
    contentFormat: SYSTEM_CHUNK_CONTENT_FORMAT
  }))

  const tableNames = await conn.tableNames()
  if (!tableNames.includes(VECTOR_DB_TABLE)) {
    const table = await conn.createTable(VECTOR_DB_TABLE, data)
    await maybeCreateVectorIndex(table)
  } else {
    const table = await conn.openTable(VECTOR_DB_TABLE)
    await assertSystemVectorMetadataReady(table)
    await table.add(data)
    await maybeCreateVectorIndex(table)
  }

  logger.info('Vector DB indexed system chunks', {
    systemDocId,
    globalDocId,
    chunkCount: chunks.length,
    category,
    groupName
  })
}

export async function searchSystemChunks(
  query: string,
  options: SearchSystemChunksOptions = {}
): Promise<
  {
    text: string
    score: number
    systemDocId: number
    globalDocId: number
    groupId: number | null
    category: string
    groupName: string
  }[]
> {
  if (options.activeGroupIds !== undefined && normalizeIds(options.activeGroupIds).length === 0) {
    return []
  }

  const table = await openSystemChunksTable()
  if (!table) return []

  await assertSystemVectorMetadataReady(table)

  const queryVec = await embed(query)
  const filter = buildSystemChunkFilter(options)
  const results = await table
    .search(queryVec)
    .where(filter)
    .limit(options.k ?? VECTOR_SEARCH_K)
    .toArray()
  const normalizedRows = results.flatMap((row) => {
    const normalized = normalizeSystemChunkRow(row)
    return normalized ? [normalized] : []
  })

  const hits = normalizedRows.map((r) => ({
    text: r.text,
    score: 1 / (1 + r.distance * r.distance),
    systemDocId: r.systemDocId,
    globalDocId: r.globalDocId,
    groupId: r.groupId,
    category: r.category,
    groupName: r.groupName
  }))

  if (hits.length > 0) {
    logger.info('Vector DB system chunk search hits', {
      queryLength: query.length,
      requestedK: options.k ?? VECTOR_SEARCH_K,
      returnedCount: hits.length,
      category: options.category,
      activeGroupCount:
        options.activeGroupIds === undefined
          ? undefined
          : normalizeIds(options.activeGroupIds).length,
      filter,
      hits: hits.map((hit, index) => ({
        rank: index + 1,
        systemDocId: hit.systemDocId,
        globalDocId: hit.globalDocId,
        groupId: hit.groupId,
        groupName: asciiLogText(hit.groupName),
        category: hit.category,
        score: Number(hit.score.toFixed(4)),
        chunkIndex: normalizedRows[index]?.chunkIndex
      }))
    })
  }

  return hits
}

export async function deleteSystemChunks(systemDocId: number): Promise<void> {
  const table = await openSystemChunksTable()
  if (!table) return
  await table.delete(`systemDocId = ${systemDocId}`)
  logger.info('Vector DB deleted system chunks', { systemDocId })
}

export async function updateSystemChunksActive(
  systemDocId: number,
  active: boolean
): Promise<void> {
  const table = await openSystemChunksTable()
  if (!table) {
    throw new Error('System vector table is missing; reindex required')
  }

  const result = await table.update({
    where: `systemDocId = ${systemDocId}`,
    values: { active }
  })
  if (result.rowsUpdated === 0) {
    throw new Error('System vector chunks not found; reindex required')
  }
  logger.info('Vector DB updated system chunk active state', { systemDocId, active })
}

export async function updateSystemChunksGroupName(
  groupId: number,
  groupName: string
): Promise<number> {
  const table = await openSystemChunksTable()
  if (!table) return 0

  await assertSystemVectorMetadataReady(table)
  const result = await table.update({
    where: `groupId = ${groupId}`,
    values: { groupName }
  })
  logger.info('Vector DB updated system chunk group name', {
    groupId,
    groupName: asciiLogText(groupName),
    rowsUpdated: result.rowsUpdated
  })
  return result.rowsUpdated
}

export async function systemVectorTableNeedsMetadataRebuild(): Promise<boolean> {
  const table = await openSystemChunksTable()
  if (!table) return false

  return !(await getSystemVectorMetadataState(table)).ready
}

export async function dropSystemVectorTable(): Promise<boolean> {
  const conn = await getDb()
  const tableNames = await conn.tableNames()
  if (!tableNames.includes(VECTOR_DB_TABLE)) return false

  await conn.dropTable(VECTOR_DB_TABLE)
  logger.warn('Vector DB dropped system chunks table for metadata rebuild', {
    table: VECTOR_DB_TABLE
  })
  return true
}
