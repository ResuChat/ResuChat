import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { ValidationError } from '../../../lib/errors'
import { DocumentLoader } from '../../../lib/document/loader'
import { assertSupportedUploadFile, parseFileContent } from '../../../lib/file-content'
import {
  indexSystemDocumentChunks,
  deleteSystemChunks,
  updateSystemChunksActive,
  isSystemVectorTableSchemaStaleError
} from '../../../lib/document/vector-db'
import { systemDocIndexQueue } from '../../../lib/queue'
import { logger } from '../../../lib/logger'
import { publishWsEvent } from '../../ws-events.service'
import { classifySystemDocument, formatSystemDocumentAsMarkdown } from './classification.service'
import type { ContentCategory } from './classification.service'
import {
  findGlobalDocByHash,
  createGlobalDocument,
  createSystemDocument,
  findSystemDocById,
  deleteSystemDocument as deleteSystemDocRecord,
  getGlobalDocRefCount,
  deleteGlobalDocument,
  findSystemDocByGlobalDocAndGroup,
  requeueSystemDocument,
  getSystemDocumentIndexTarget,
  updateSystemDocumentIndexState,
  getSystemDocumentById,
  updateSystemDocumentActive as updateDocActive,
  getSystemDocumentGroup
} from '../../../storage/document/file-manager'
import type { UploadResult } from '../../../types/api'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'documents', 'by_hash')
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

const SYSTEM_VECTOR_SCHEMA_STALE_MESSAGE =
  '系统向量库 schema 过旧，请运行 pnpm --filter @resuchat/server run vector:rebuild-system 重建后重试'

export async function uploadSystemDocument(
  fileBuffer: Buffer,
  originalName: string,
  groupId: number,
  mimetype?: string
): Promise<UploadResult> {
  assertSupportedUploadFile(originalName, mimetype)
  const group = await getSystemDocumentGroup(groupId)
  if (!group) throw new ValidationError('System document group not found')

  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  const ext = path.extname(originalName).replace('.', '').toLowerCase() || 'txt'
  const fileName = `${fileHash}.${ext}`
  const filePath = path.join(UPLOADS_DIR, fileName)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, fileBuffer)
  }

  let globalDocId: number
  const existingGlobalDoc = await findGlobalDocByHash(fileHash)
  if (existingGlobalDoc) {
    globalDocId = existingGlobalDoc.id
  } else {
    globalDocId = await createGlobalDocument(
      fileHash,
      filePath,
      originalName,
      ext,
      fileBuffer.length
    )
  }

  const existingSystemDoc = await findSystemDocByGlobalDocAndGroup(globalDocId, groupId)
  const systemDocId = existingSystemDoc
    ? existingSystemDoc.id
    : await createSystemDocument(globalDocId, groupId, group.name, originalName)

  if (existingSystemDoc) {
    await requeueSystemDocument(systemDocId, group.name, originalName)
  }

  const job = await systemDocIndexQueue.add('index', { systemDocId })
  logger.info('System document indexing queued', { systemDocId, globalDocId, jobId: job.id })
  await notifySystemKnowledgeChanged('document_queued', { systemDocId, groupId })

  return {
    globalDocId,
    systemDocId,
    jobId: String(job.id ?? ''),
    indexStatus: 'pending'
  }
}

export async function processSystemDocumentIndexing(systemDocId: number): Promise<void> {
  const target = await getSystemDocumentIndexTarget(systemDocId)
  if (!target) throw new Error('System document not found')

  await updateSystemDocumentIndexState(systemDocId, {
    status: 'indexing',
    errorMessage: null
  })
  await notifySystemDocumentIndexChanged({
    systemDocId,
    status: 'indexing',
    name: target.originalName
  })

  try {
    const fileBuffer = fs.readFileSync(target.filePath)
    const fileContent = await parseFileContent({
      buffer: fileBuffer,
      originalname: target.originalName,
      mimetype: '',
      size: fileBuffer.length
    })

    if (fileContent.trim().length < 100) {
      throw new ValidationError('File content too short')
    }

    const category = await classifySystemDocument(fileContent, target.originalName)
    const markdownText = await formatSystemDocumentAsMarkdown(
      fileContent,
      target.originalName,
      category
    )
    const rag = new DocumentLoader()
    await rag.loadDocumentsFromText([
      {
        text: markdownText,
        metadata: {
          source: target.originalName,
          file_type: 'system',
          group_id: target.groupId,
          group_name: target.groupName,
          category
        }
      }
    ])

    await deleteSystemChunks(target.id)
    if (rag.chunks.length > 0) {
      await indexSystemDocumentChunks(
        target.id,
        target.globalDocId,
        target.groupId,
        rag.chunks.map((c, i) => ({ pageContent: c.pageContent, chunkIndex: i })),
        category,
        target.groupName,
        target.active
      )
    }

    await updateSystemDocumentIndexState(systemDocId, {
      status: 'done',
      category,
      chunksCount: rag.chunks.length,
      errorMessage: null,
      indexedAt: Date.now()
    })
    await notifySystemDocumentIndexChanged({
      systemDocId,
      status: 'done',
      category,
      chunksCount: rag.chunks.length,
      name: target.originalName
    })
    logger.info('System document indexed', {
      systemDocId,
      globalDocId: target.globalDocId,
      category,
      chunksCount: rag.chunks.length,
      markdownLength: markdownText.length
    })
  } catch (error) {
    if (isSystemVectorTableSchemaStaleError(error)) {
      await updateSystemDocumentIndexState(systemDocId, {
        status: 'failed',
        errorMessage: SYSTEM_VECTOR_SCHEMA_STALE_MESSAGE
      })
      await notifySystemDocumentIndexChanged({
        systemDocId,
        status: 'failed',
        errorMessage: SYSTEM_VECTOR_SCHEMA_STALE_MESSAGE,
        name: target.originalName
      })
      logger.warn('System document indexing failed because vector schema is stale', {
        systemDocId,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error)
      })
      throw new Error(SYSTEM_VECTOR_SCHEMA_STALE_MESSAGE, { cause: error })
    }

    const message = error instanceof Error ? error.message : String(error)
    await updateSystemDocumentIndexState(systemDocId, {
      status: 'failed',
      errorMessage: message
    })
    await notifySystemDocumentIndexChanged({
      systemDocId,
      status: 'failed',
      errorMessage: message,
      name: target.originalName
    })
    throw error
  }
}

export async function deleteSystemDocument(id: number): Promise<void> {
  const doc = await findSystemDocById(id)
  if (!doc) throw new Error('System document not found')

  await deleteSystemChunks(id)

  await deleteSystemDocRecord(id)
  await notifySystemKnowledgeChanged('document_deleted', { systemDocId: id })

  if ((await getGlobalDocRefCount(doc.global_doc_id)) <= 0) {
    if (fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path)
    await deleteGlobalDocument(doc.global_doc_id)
  }
}

export async function listSystemDocuments(): Promise<
  import('../../../storage/document/file-manager').SystemDocRecord[]
> {
  const { listSystemDocuments: listSystemDocs } =
    await import('../../../storage/document/file-manager')
  return await listSystemDocs()
}

export async function requeuePendingSystemDocumentIndexing(): Promise<number> {
  const { listSystemDocuments: listSystemDocs, requeuePendingSystemDocuments } =
    await import('../../../storage/document/file-manager')
  const docs = await listSystemDocs()
  const targets = docs.filter(
    (doc) => doc.index_status === 'pending' || doc.index_status === 'indexing'
  )
  const requeuedIds = await requeuePendingSystemDocuments(targets.map((doc) => doc.id))

  for (const id of requeuedIds) {
    const job = await systemDocIndexQueue.add('index', { systemDocId: id })
    logger.info('System document indexing requeued', {
      systemDocId: id,
      jobId: job.id
    })
  }

  return requeuedIds.length
}

export async function getSystemDocument(
  id: number
): Promise<import('../../../storage/document/file-manager').SystemDocRecord | null> {
  return (await getSystemDocumentById(id)) ?? null
}

export async function updateSystemDocumentActive(
  id: number,
  active: boolean
): Promise<{ id: number; active: boolean }> {
  const doc = await getSystemDocumentById(id)
  if (!doc) throw new Error('System document not found')

  const shouldSyncVector = doc.index_status === 'done' && doc.chunks_count > 0
  const previousActive = doc.active

  if (!active) {
    if (shouldSyncVector) {
      try {
        await updateSystemChunksActive(id, false)
      } catch (error) {
        if (!isMissingSystemVectorRowsError(error)) throw error
      }
    }

    const changes = await updateDocActive(id, false)
    if (changes === 0) {
      if (shouldSyncVector) {
        try {
          await updateSystemChunksActive(id, previousActive)
        } catch (error) {
          logger.error('Failed to rollback system document vector active state', {
            systemDocId: id,
            active: previousActive,
            error
          })
        }
      }
      throw new Error('System document not found')
    }
    await notifySystemKnowledgeChanged('document_active_changed', {
      systemDocId: id,
      active: false
    })
    return { id, active: false }
  }

  const changes = await updateDocActive(id, true)
  if (changes === 0) throw new Error('System document not found')

  try {
    if (shouldSyncVector) {
      await updateSystemChunksActive(id, true)
    }
  } catch (error) {
    try {
      await updateDocActive(id, previousActive)
    } catch (rollbackError) {
      logger.error('Failed to rollback system document DB active state', {
        systemDocId: id,
        active: previousActive,
        error: rollbackError
      })
    }
    throw error
  }

  await notifySystemKnowledgeChanged('document_active_changed', {
    systemDocId: id,
    active: true
  })
  return { id, active: true }
}

function isMissingSystemVectorRowsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.message.includes('System vector table is missing') ||
    error.message.includes('System vector chunks not found')
  )
}

async function notifySystemDocumentIndexChanged(payload: {
  systemDocId: number
  status: 'indexing' | 'done' | 'failed'
  category?: ContentCategory
  chunksCount?: number
  errorMessage?: string
  name?: string
}): Promise<void> {
  await publishWsEvent({
    target: 'role',
    role: 'admin',
    message: {
      type: 'system_doc_index_changed',
      payload
    }
  })
}

async function notifySystemKnowledgeChanged(
  reason: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await publishWsEvent({
    target: 'role',
    role: 'admin',
    message: {
      type: 'system_knowledge_changed',
      payload: { reason, ...payload }
    }
  })
}
