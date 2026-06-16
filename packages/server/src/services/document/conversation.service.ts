import crypto from 'crypto'
import { LLM_MARKDOWN_TIMEOUT, MAX_FILE_VERSIONS, UPLOAD_PROGRESS_TTL } from '../../lib/config'
import { NotFoundError, ValidationError } from '../../lib/errors'
import { getFastModel } from '../../lib/ai/providers'
import { buildResumeMarkdownPrompt } from '../../lib/ai/prompts'
import { DocumentLoader } from '../../lib/document/loader'
import {
  addFileToConversation,
  cleanupOldVersions,
  updateDocumentRefSnapshot,
  addToUserLibrary,
  getUserDocWithFile
} from '../../storage/document/file-manager'
import {
  createConversation,
  deleteConversation,
  getDeletedUserConversations,
  getConversationDocuments,
  getConversationMessages as getStoredConversationMessages,
  getConversationTitle,
  getLatestConversationResumeSnapshot,
  getMessagesBefore,
  getUserConversations,
  isConversationOwner,
  isConversationParticipant,
  purgeExpiredDeletedConversations as purgeExpiredDeletedConversationsFromStorage,
  restoreConversationWithinTtl,
  setConversationChunksWithTypes,
  appendConversationChunks
} from '../../storage/repository'
import { decodeFilename } from '../../lib/text'
import { classifyReferenceFile } from '../chat/classifier.service'
import { inferStoredFileType, parseFileContent, type MulterFile } from '../../lib/file-content'
import { logger } from '../../lib/logger'
import { createOwnerGuard, type AuthGuard, type OwnerIdGetter } from '../../middleware/authGuard'

export const uploadProgress = new Map<string, { progress: number; status: string }>()

import type { StartResult } from '../../types/api'

export type { StartResult } from '../../types/api'

export async function isConversationOwnedByUser(
  conversationId: string,
  userId: string
): Promise<boolean> {
  return await isConversationOwner(conversationId, userId)
}

export async function isConversationParticipantForUser(
  conversationId: string,
  userId: string
): Promise<boolean> {
  return await isConversationParticipant(conversationId, userId)
}

export function createConversationOwnerGuard(getId: OwnerIdGetter): AuthGuard {
  return createOwnerGuard(getId, ({ id, authUserId }) => isConversationOwnedByUser(id, authUserId))
}

export function createConversationParticipantGuard(getId: OwnerIdGetter): AuthGuard {
  return createOwnerGuard(getId, ({ id, authUserId }) =>
    isConversationParticipantForUser(id, authUserId)
  )
}

export async function listConversationsForUser(userId: string, page: number, pageSize: number) {
  return await getUserConversations(userId, page, pageSize)
}

export async function listDeletedConversationsForUser(
  userId: string,
  page: number,
  pageSize: number
) {
  return await getDeletedUserConversations(userId, page, pageSize)
}

export async function getConversationMessages(params: {
  conversationId: string
  beforeId?: string
  page: number
  pageSize: number
  order: 'ASC' | 'DESC'
}) {
  let messagesResult: {
    data: unknown[]
    total: number
    initialPrompt?: string | null
    nextCursor?: string | null
  }
  let pagination: Record<string, unknown>

  if (params.beforeId) {
    messagesResult = await getMessagesBefore(params.conversationId, params.beforeId, 100)
    pagination = {
      pageSize: 100,
      total: messagesResult.total,
      nextCursor: messagesResult.nextCursor
    }
  } else {
    messagesResult = await getStoredConversationMessages(
      params.conversationId,
      params.page,
      params.pageSize,
      params.order
    )
    pagination = { page: params.page, pageSize: params.pageSize, total: messagesResult.total }
  }

  const documents = await getConversationDocuments(params.conversationId)
  const resumeContent = await getLatestConversationResumeSnapshot(params.conversationId)
  const title = await getConversationTitle(params.conversationId)

  return {
    data: {
      messages: messagesResult.data,
      documents,
      initialPrompt: messagesResult.initialPrompt ?? null,
      title,
      resumeContent: resumeContent || '',
      originalRefId:
        documents.find((document: { role?: string; id?: number }) => document.role === 'original')
          ?.id || 0
    },
    pagination
  }
}

export async function deleteConversationById(conversationId: string): Promise<void> {
  await deleteConversation(conversationId)
}

export async function restoreDeletedConversation(conversationId: string): Promise<void> {
  const restored = await restoreConversationWithinTtl(conversationId)
  if (!restored) throw new NotFoundError('Conversation not found')
}

export async function purgeExpiredDeletedConversations(now?: number) {
  return await purgeExpiredDeletedConversationsFromStorage(now)
}

export async function startConversation(
  files: MulterFile[] | undefined,
  query: string,
  userId: string | null,
  onProgress?: (progress: number, status: string) => void,
  docId?: number,
  providedConversationId?: string
): Promise<StartResult> {
  if ((!files || files.length === 0) && !docId) {
    throw new ValidationError('请先上传简历或选择文档库中的简历')
  }

  // 来自文档库：后端查文件 + markdown
  let preParsedMarkdown: string | undefined
  let preParsedLocalName: string | undefined
  if (docId && userId) {
    const fileData = await getUserDocWithFile(userId, docId)
    if (!fileData) throw new ValidationError('文档不存在或无权访问')
    preParsedMarkdown = fileData.markdown ?? undefined
    preParsedLocalName = fileData.localName
    // 包装成 MulterFile 数组（给后续 addFileToConversation 用）
    if (!files || files.length === 0) {
      files = [
        {
          buffer: fileData.buffer,
          originalname: fileData.originalName,
          mimetype: '',
          size: fileData.buffer.length
        }
      ]
    }
  }

  const conversationId =
    providedConversationId ?? `conv_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

  const report = (progress: number, status: string) => {
    uploadProgress.set(conversationId, { progress, status })
    onProgress?.(progress, status)
  }

  report(0, '正在准备...')

  const initialPrompt = query && query.trim() ? query.trim() : ''
  if (userId) {
    await createConversation(conversationId, userId, initialPrompt)
  }

  let firstMarkdownText = ''
  let firstOriginalRefId = 0

  if (files && files.length > 0) {
    const decodedFiles = files.map((file) => ({
      ...file,
      originalname: decodeFilename(file.originalname)
    }))

    let firstFile = true
    for (const file of decodedFiles) {
      const fileType = inferStoredFileType(file.originalname)
      if (fileType === 'doc' && !preParsedMarkdown) {
        throw new ValidationError(
          '暂不支持旧版 .doc 文件，请转换为 .docx、PDF、TXT 或 Markdown 后再上传'
        )
      }

      const result = await addFileToConversation(
        conversationId,
        file.buffer,
        file.originalname,
        fileType,
        'original',
        undefined,
        undefined,
        {
          localName: preParsedLocalName,
          sourceUserDocumentId: docId
        }
      )
      let markdownText: string

      if (preParsedMarkdown) {
        // 来自文档库：跳过 LLM，直接复用已有 markdown
        markdownText = preParsedMarkdown
      } else {
        // 来自上传文件：完整解析流程
        const fileContent = await parseFileContent(file)

        const classification = await classifyReferenceFile(fileContent)
        if (classification !== 'resume') {
          throw new ValidationError('上传文件不是简历，请上传简历文件')
        }

        report(30, '正在解析为结构化格式...')

        const markdownResponse = await getFastModel().invoke(
          [
            {
              role: 'user',
              content: buildResumeMarkdownPrompt(fileContent)
            }
          ],
          { signal: AbortSignal.timeout(LLM_MARKDOWN_TIMEOUT) }
        )
        markdownText =
          typeof markdownResponse.content === 'string' ? markdownResponse.content : fileContent
        const mdMatch = markdownText.match(/```(?:markdown)?\s*([\s\S]*?)```/)
        if (mdMatch) {
          markdownText = mdMatch[1].trim()
        } else {
          const headingStart = markdownText.search(/^#{1,3}\s/m)
          if (headingStart > 0) markdownText = markdownText.slice(headingStart)
        }
      }

      report(80, '正在构建索引...')

      const fileRAG = new DocumentLoader()
      await fileRAG.loadDocumentsFromText([
        { text: markdownText, metadata: { source: file.originalname, file_type: 'resume' } }
      ])

      const typedChunks = fileRAG.chunks.map((chunk) => ({
        pageContent: chunk.pageContent,
        metadata: chunk.metadata,
        role: 'original' as const,
        category: 'resume'
      }))

      // 同步解析结果到用户文档库（每个文件都同步）
      if (userId) {
        addToUserLibrary(
          userId,
          result.globalDocId,
          file.originalname,
          'conversation',
          markdownText,
          'resume'
        ).catch((error) =>
          logger.error('Failed to sync conversation parse result to user library', {
            userId,
            conversationId,
            globalDocId: result.globalDocId,
            error
          })
        )
      }

      if (firstFile) {
        firstMarkdownText = markdownText
        firstOriginalRefId = result.refId
        updateDocumentRefSnapshot(result.refId, markdownText)
        await setConversationChunksWithTypes(conversationId, typedChunks, result.refId)
        firstFile = false
      } else {
        await appendConversationChunks(conversationId, typedChunks, result.refId)
      }
    }
    await cleanupOldVersions(conversationId, 'original', MAX_FILE_VERSIONS)
  }

  report(100, '完成')
  setTimeout(() => uploadProgress.delete(conversationId), UPLOAD_PROGRESS_TTL)

  return {
    conversationId,
    initialPrompt,
    resumeContent: firstMarkdownText,
    originalRefId: firstOriginalRefId
  }
}
