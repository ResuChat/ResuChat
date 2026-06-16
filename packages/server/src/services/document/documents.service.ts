import fs from 'fs'
import { ValidationError, NotFoundError, ForbiddenError } from '../../lib/errors'
import { DocumentLoader } from '../../lib/document/loader'
import { parseAIContent, generateResumePDF } from '../../lib/pdf/pdfmaker'
import {
  addFileToConversation,
  cleanupOldVersions,
  getConversationDocsByType,
  getDocumentRef,
  removeFileFromConversation
} from '../../storage/document/file-manager'
import {
  isConversationDocumentOwner,
  setConversationChunksWithTypes,
  storeMessage
} from '../../storage/repository'
import { extractPdfText } from '../../lib/pdf/extractor'
import { triggerAutoSummary } from '../chat/summary.service'
import { createOwnerGuard, type AuthGuard, type OwnerIdGetter } from '../../middleware/authGuard'

export async function isConversationDocumentOwnedByUser(
  refId: string,
  userId: string
): Promise<boolean> {
  const parsedRefId = parsePositiveInteger(refId)
  if (!parsedRefId) return false
  return await isConversationDocumentOwner(parsedRefId, userId)
}

export function createConversationDocumentOwnerGuard(getId: OwnerIdGetter): AuthGuard {
  return createOwnerGuard(getId, ({ id, authUserId }) =>
    isConversationDocumentOwnedByUser(id, authUserId)
  )
}

/** 获取参考文档列表 */
export async function getDocuments(conversationId: string) {
  return getConversationDocsByType(conversationId, 'reference')
}

/** 获取版本历史 */
export async function getHistory(conversationId: string) {
  const originals = await getConversationDocsByType(conversationId, 'original')
  const modified = await getConversationDocsByType(conversationId, 'modified')
  const versions = [
    ...originals.map((d) => ({
      refId: d.id,
      type: 'original' as const,
      version: 1,
      fileName: d.original_name,
      fileSize: d.file_size,
      createdAt: d.created_at
    })),
    ...modified.map((d) => ({
      refId: d.id,
      type: 'modified' as const,
      version: d.version,
      fileName: d.original_name,
      fileSize: d.file_size,
      createdAt: d.created_at
    }))
  ]
  versions.sort((a, b) => a.createdAt - b.createdAt)
  return versions
}

/** 删除文档引用 */
export async function deleteDocument(conversationId: string, refId: number) {
  const ref = await getDocumentRef(refId)
  if (!ref) throw new NotFoundError('Document not found')
  if (ref.conversation_id !== conversationId) throw new ForbiddenError('Access denied')
  await removeFileFromConversation(conversationId, refId)
}

/** 恢复历史版本 */
export async function restoreDocument(refId: number): Promise<{
  downloadUrl: string
  refId: number
}> {
  const ref = await getDocumentRef(refId)
  if (!ref) throw new NotFoundError('Document not found')

  return restoreDocumentFromRef(ref)
}

async function restoreDocumentFromRef(
  ref: NonNullable<Awaited<ReturnType<typeof getDocumentRef>>>
): Promise<{
  downloadUrl: string
  refId: number
}> {
  let fullText: string

  if (ref.content_snapshot) {
    fullText = ref.content_snapshot
  } else {
    if (!fs.existsSync(ref.file_path)) {
      throw new NotFoundError('File not found on disk')
    }
    const rawText = await extractPdfText(fs.readFileSync(ref.file_path))
    fullText = rawText
      .replace(/--\s*\d+\s*of\s*\d+\s*--/g, '')
      .replace(/(?:Page|第)\s*\d+\s*(?:of|\/)\s*\d+/gi, '')
      .replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, '')
      .trim()
  }

  if (fullText.length < 100) {
    throw new ValidationError('该版本 PDF 不包含可恢复的文本内容')
  }

  const updatedRAG = new DocumentLoader()
  await updatedRAG.loadDocumentsFromText([{ text: fullText, metadata: { source: 'restored' } }])
  const updatedChunks = updatedRAG.chunks.map((chunk) => ({
    pageContent: chunk.pageContent,
    metadata: chunk.metadata,
    role: 'modified' as const,
    category: 'resume'
  }))
  await setConversationChunksWithTypes(ref.conversation_id, updatedChunks)

  await storeMessage(ref.conversation_id, 'assistant', `已恢复到版本 v${ref.version}`)
  triggerAutoSummary(ref.conversation_id)

  const aiContent = parseAIContent(fullText)
  const newPdf = await generateResumePDF(structuredClone(aiContent))
  const fileName = `resume_restored_${Date.now()}.pdf`
  const fileResult = await addFileToConversation(
    ref.conversation_id,
    Buffer.from(newPdf),
    fileName,
    'pdf',
    'modified',
    undefined,
    fullText
  )
  await cleanupOldVersions(ref.conversation_id, 'modified', 5)

  return {
    downloadUrl: `/documents/${fileResult.refId}/download`,
    refId: fileResult.refId
  }
}

/** 下载文件 */
export async function downloadDocument(refId: number): Promise<{
  filePath: string
  originalName: string
}> {
  const ref = await getDocumentRef(refId)
  if (!ref) throw new NotFoundError('Document not found')
  if (!fs.existsSync(ref.file_path)) throw new NotFoundError('File not found on disk')
  return { filePath: ref.file_path, originalName: ref.original_name }
}

function parsePositiveInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}
