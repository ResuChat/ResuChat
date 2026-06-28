import fs from 'fs'
import { LLM_MARKDOWN_TIMEOUT, DOC_PARSE_MAX_CHARS } from '../../lib/config'
import { getChatModel } from '../../lib/ai/providers'
import { buildResumeMarkdownPrompt } from '../../lib/ai/prompts'
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors'
import { assertSupportedUploadFile, parseFileContent } from '../../lib/file-content'
import { docParseQueue } from '../../lib/queue'
import { logger } from '../../lib/logger'
import { getDocumentRef, getDocumentRefForUser } from '../../storage/document/file-manager'
import {
  addToUserLibrary,
  cancelUserDocumentParsing,
  deleteUserDocument,
  findUserDocumentByGlobalDoc,
  getUserDocById,
  getUserDocFileInfo,
  isUserDocumentOwner,
  listUserDocuments,
  markUserDocumentParsing,
  resetParsingUserDocuments as resetParsingUserDocumentsInStorage,
  resetPendingUserDocuments as resetPendingUserDocumentsInStorage,
  updateUserDocName,
  updateUserDocumentParseResult,
  uploadUserDocument
} from '../../storage/user/user-documents'
import { publishWsEvent } from '../ws-events.service'
import { classifyReferenceFile } from '../chat/classifier.service'
import { createOwnerGuard, type AuthGuard, type OwnerIdGetter } from '../../middleware/authGuard'

async function requireOwnUserDocument(
  userId: string,
  docId: number
): Promise<{ id: number; userId: string }> {
  const doc = await getUserDocById(docId)
  if (!doc) throw new NotFoundError('Document not found')
  if (doc.userId !== userId) throw new ForbiddenError('Access denied')
  return doc
}

export async function isUserDocumentOwnedByUser(docId: string, userId: string): Promise<boolean> {
  const parsedDocId = parsePositiveInteger(docId)
  if (!parsedDocId) return false
  return await isUserDocumentOwner(parsedDocId, userId)
}

export function createUserDocumentOwnerGuard(getId: OwnerIdGetter): AuthGuard {
  return createOwnerGuard(getId, ({ id, authUserId }) => isUserDocumentOwnedByUser(id, authUserId))
}

export async function uploadUserDocumentAndQueueParse(
  userId: string,
  fileBuffer: Buffer,
  originalName: string,
  mimetype?: string
): Promise<{ id: number; globalDocId: number }> {
  assertSupportedUploadFile(originalName, mimetype)
  const result = await uploadUserDocument(userId, fileBuffer, originalName)
  await docParseQueue.add('parse', {
    docId: result.id,
    filePath: result.filePath,
    originalName: result.originalName
  })
  return { id: result.id, globalDocId: result.globalDocId }
}

async function enqueueUserDocumentParse(id: number): Promise<void> {
  const doc = await getUserDocFileInfo(id)
  if (!doc || !fs.existsSync(doc.filePath)) {
    throw new NotFoundError('File not found')
  }

  assertSupportedUploadFile(doc.originalName)
  await markUserDocumentParsing(id)
  await docParseQueue.add('parse', {
    docId: id,
    filePath: doc.filePath,
    originalName: doc.originalName
  })
}

export async function listUserDocumentsForUser(
  userId: string,
  options: {
    search?: string
    fileType?: string
    category?: string
    parseStatus?: string
    page: number
    pageSize: number
  }
) {
  return await listUserDocuments(userId, options)
}

export async function renameUserDocumentForUser(
  userId: string,
  id: number,
  localName: string
): Promise<void> {
  await requireOwnUserDocument(userId, id)
  await updateUserDocName(id, localName)
}

export async function deleteUserDocumentForUser(userId: string, id: number): Promise<void> {
  await requireOwnUserDocument(userId, id)
  await deleteUserDocument(id)
}

export async function retryParseUserDocumentForUser(userId: string, id: number): Promise<void> {
  await requireOwnUserDocument(userId, id)
  await retryParseUserDocument(id)
}

export async function cancelParseUserDocumentForUser(userId: string, id: number): Promise<void> {
  await requireOwnUserDocument(userId, id)
  await cancelParseUserDocument(id)
}

export async function parseUserDocumentFromFile(
  docId: number,
  filePath: string,
  originalName: string
): Promise<void> {
  const fileBuffer = await fs.promises.readFile(filePath)
  await parseUserDocument(docId, fileBuffer, originalName)
}

export async function parseUserDocument(
  docId: number,
  fileBuffer: Buffer,
  originalName: string
): Promise<void> {
  let status = 'failed'
  let category = 'unknown'

  try {
    const fileContent = await parseFileContent({
      buffer: fileBuffer,
      originalname: originalName,
      mimetype: '',
      size: fileBuffer.length
    })

    const classification = await classifyReferenceFile(fileContent).catch(() => null)
    if (classification !== 'resume' && classification !== 'job') {
      await updateUserDocumentParseResult(docId, { parseStatus: status, category }, true)
      return
    }

    if (classification === 'job') {
      status = 'done'
      category = 'job'
      await updateUserDocumentParseResult(docId, { parseStatus: status, category }, true)
      return
    }

    const response = await getChatModel().invoke(
      [
        {
          role: 'user',
          content: buildResumeMarkdownPrompt(fileContent.slice(0, DOC_PARSE_MAX_CHARS))
        }
      ],
      { signal: AbortSignal.timeout(LLM_MARKDOWN_TIMEOUT) }
    )
    let markdown = typeof response.content === 'string' ? response.content : fileContent
    const mdMatch = markdown.match(/```(?:markdown)?\s*([\s\S]*?)```/)
    if (mdMatch) markdown = mdMatch[1].trim()

    status = 'done'
    category = 'resume'
    await updateUserDocumentParseResult(
      docId,
      {
        parseStatus: status,
        category,
        markdownContent: markdown
      },
      true
    )
  } catch (error) {
    logger.error('User document parse failed', { docId, originalName, error })
    await updateUserDocumentParseResult(docId, { parseStatus: 'failed' }, true).catch(
      (updateError) => {
        logger.error('Failed to mark user document parse as failed', { docId, updateError })
      }
    )
  } finally {
    const doc = await getUserDocFileInfo(docId)
    if (doc) {
      await publishWsEvent({
        target: 'user',
        userId: doc.userId,
        message: {
          type: doc.parseStatus === 'done' ? 'doc_parse_done' : 'doc_parse_failed',
          payload: {
            docId,
            status: doc.parseStatus,
            category: doc.contentCategory ?? category,
            name: originalName
          }
        }
      })
    }
  }
}

export async function retryParseUserDocument(id: number): Promise<void> {
  await enqueueUserDocumentParse(id)
}

export async function cancelParseUserDocument(id: number): Promise<void> {
  await cancelUserDocumentParsing(id)
}

export async function resetParsingUserDocuments(): Promise<number> {
  return resetParsingUserDocumentsInStorage()
}

export async function resetPendingUserDocuments(): Promise<number> {
  return resetPendingUserDocumentsInStorage()
}

export async function getUserDocumentDownloadInfo(
  userId: string,
  id: number
): Promise<{ filePath: string; originalName: string }> {
  const doc = await getUserDocFileInfo(id)
  if (!doc || doc.userId !== userId || !fs.existsSync(doc.filePath)) {
    throw new NotFoundError('File not found')
  }

  return {
    filePath: doc.filePath,
    originalName: doc.originalName
  }
}

export async function importConversationRefToUserLibrary(
  userId: string,
  refId: number
): Promise<void> {
  const ref = await getDocumentRef(refId)
  if (!ref) {
    throw new NotFoundError('Document ref not found')
  }

  const ownedRef = await getDocumentRefForUser(refId, userId)
  if (!ownedRef) {
    throw new ForbiddenError('Access denied')
  }

  const existing = await findUserDocumentByGlobalDoc(userId, ownedRef.globalDocId)
  if (existing) {
    throw new ConflictError(`文档已入库 文档名称：${existing.localName}`)
  }

  await addToUserLibrary(
    userId,
    ownedRef.globalDocId,
    ownedRef.localName,
    'conversation',
    ownedRef.contentSnapshot ?? undefined,
    ownedRef.category ?? undefined
  )
}

export function syncChatReferenceToUserLibrary(
  userId: string,
  conversationId: string,
  globalDocId: number,
  localName: string
): void {
  addToUserLibrary(userId, globalDocId, localName, 'conversation')
    .then((doc) => enqueueUserDocumentParse(doc.id))
    .catch((error) =>
      logger.error('Failed to sync chat reference document to user library', {
        userId,
        conversationId,
        globalDocId,
        error
      })
    )
}

function parsePositiveInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}
