import crypto from 'crypto'
import path from 'path'
import { DocumentLoader } from '../../lib/document/loader'
import { contentCategoryLabel, decodeFilename } from '../../lib/text'
import { classifyReferenceFile } from './classifier.service'
import {
  assertSupportedUploadFile,
  inferStoredFileType,
  parseFileContent,
  MulterFile
} from '../../lib/file-content'
import {
  insertConversationFileRef,
  prepareConversationFile
} from '../../storage/document/file-manager'
import { getUserDocsWithFiles } from '../../storage/user/user-documents'
import { syncChatReferenceToUserLibrary } from '../document/user-documents.service'
import { appendConversationChunksInTransaction } from '../../storage/repository'
import type { MessageAttachment } from '../../types/domain'
import { db } from '../../lib/db'
import { logger } from '../../lib/logger'
import fs from 'fs'

export interface FileProcessResult {
  refId: number
  globalDocId: number
  contentLabel: string
  fileContent: string
  category: string
  attachment: MessageAttachment
  chunks: {
    pageContent: string
    metadata: Record<string, unknown>
    role: string
    category: string
    scope: string
  }[]
}

export async function processFileAsReference(opts: {
  file: MulterFile
  conversationId: string
  processedHashes: Set<string>
  category?: string
  contentSnapshot?: string
  syncToUserLibrary?: boolean
  userId?: string
  source?: 'upload' | 'library'
  sourceDocId?: number
  displayName?: string
}): Promise<FileProcessResult | null> {
  const {
    file,
    conversationId,
    processedHashes,
    category: preCategory,
    contentSnapshot,
    syncToUserLibrary,
    userId: uid,
    source = 'upload',
    sourceDocId,
    displayName
  } = opts

  // 去重：基于文件内容 hash
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex')
  if (processedHashes.has(hash)) return null
  processedHashes.add(hash)

  const decodedName = path.basename(decodeFilename(file.originalname))
  assertSupportedUploadFile(decodedName, source === 'upload' ? file.mimetype : undefined)
  const referenceName = path.basename(displayName || decodedName)
  const fileContent = contentSnapshot?.trim() ? contentSnapshot : await parseFileContent(file)

  // 分类：优先复用已有分类，否则 LLM
  const category = preCategory || (await classifyReferenceFile(fileContent))
  const categoryLabel = contentCategoryLabel(category ?? null)

  // 持久化到对话
  const fileType = inferStoredFileType(decodedName)
  const preparedFile = prepareConversationFile(file.buffer, fileType)

  // 分块
  const fileRAG = new DocumentLoader()
  await fileRAG.loadDocumentsFromText([
    { text: fileContent, metadata: { source: referenceName, file_type: 'reference' } }
  ])
  const chunks = fileRAG.chunks.map((chunk) => ({
    pageContent: `[${categoryLabel}: ${referenceName}]\n${chunk.pageContent}`,
    metadata: chunk.metadata,
    role: 'reference' as const,
    category,
    scope: 'conversation'
  }))

  let result: { refId: number; globalDocId: number }
  try {
    result = await db.transaction(async (tx) => {
      const insertedFile = await insertConversationFileRef(tx, {
        conversationId,
        preparedFile,
        originalName: decodedName,
        fileType,
        role: 'reference',
        category,
        contentSnapshot,
        options: {
          localName: referenceName,
          sourceUserDocumentId: source === 'library' ? sourceDocId : undefined
        }
      })
      await appendConversationChunksInTransaction(tx, conversationId, chunks, insertedFile.refId)
      return { refId: insertedFile.refId, globalDocId: insertedFile.globalDocId }
    })
  } catch (error) {
    if (preparedFile.isNewPhysicalFile) {
      try {
        if (fs.existsSync(preparedFile.filePath)) fs.unlinkSync(preparedFile.filePath)
      } catch (cleanupError) {
        logger.error('Failed to delete orphan reference file after transaction failure', {
          conversationId,
          fileName: decodedName,
          filePath: preparedFile.filePath,
          error: cleanupError
        })
      }
    }
    throw error
  }

  // 同步到用户文档库（仅上传路径需要）
  if (syncToUserLibrary && uid) {
    syncChatReferenceToUserLibrary(uid, conversationId, result.globalDocId, referenceName)
  }

  return {
    refId: result.refId,
    globalDocId: result.globalDocId,
    contentLabel: `[${categoryLabel}: ${referenceName}]\n`,
    fileContent,
    category,
    attachment: {
      type: 'reference',
      source,
      name: referenceName,
      refId: result.refId,
      globalDocId: result.globalDocId,
      docId: sourceDocId,
      fileType,
      fileSize: file.buffer.length,
      category
    },
    chunks
  }
}

/** 从用户文档库加载文档并按参考资料逻辑加入对话 */
export async function processDocIdsAsReference(
  docIds: number[],
  userId: string,
  conversationId: string,
  processedHashes: Set<string>
): Promise<FileProcessResult[]> {
  const results: FileProcessResult[] = []
  const docsById = await getUserDocsWithFiles(userId, docIds)
  for (const docId of docIds) {
    const fileData = docsById.get(docId)
    if (!fileData) continue
    const file: MulterFile = {
      buffer: fileData.buffer,
      originalname: fileData.originalName,
      mimetype: '',
      size: fileData.buffer.length
    }
    const r = await processFileAsReference({
      file,
      conversationId,
      processedHashes,
      category: fileData.contentCategory ?? undefined,
      contentSnapshot: fileData.markdown ?? undefined,
      syncToUserLibrary: false,
      userId,
      source: 'library',
      sourceDocId: docId,
      displayName: fileData.localName
    })
    if (r) results.push(r)
  }
  return results
}
