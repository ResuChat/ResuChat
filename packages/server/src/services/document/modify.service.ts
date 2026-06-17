import { createUIMessageStream } from 'ai'
import fs from 'fs'
import { ValidationError, NotFoundError } from '../../lib/errors'
import { getChatModel } from '../../lib/ai/providers'
import { buildApplyPrompt, buildAcceptPrompt } from '../../lib/ai/prompts'
import {
  parseResumeSections,
  sectionsToContentArray,
  generateResumePDF
} from '../../lib/pdf/pdfmaker'
import { replaceText } from '../../lib/pdf/markdown'
import { DocumentLoader } from '../../lib/document/loader'
import {
  cleanupOldVersionsInTransaction,
  getConversationDocsByType,
  insertConversationFileRef,
  prepareConversationFile
} from '../../storage/document/file-manager'
import {
  getConversationChunksWithTypes,
  setConversationChunksWithTypesInTransaction,
  storeMessageInTransaction
} from '../../storage/repository'
import { mergeOverlappingChunks } from '../../lib/text'
import { extractPdfText } from '../../lib/pdf/extractor'
import { logger } from '../../lib/logger'
import { triggerAutoSummary } from '../chat/summary.service'
import { db } from '../../lib/db'

interface Optimization {
  field: string
  current: string
  suggestion: string
  reason?: string
}

interface ApplyModificationParams {
  conversationId: string
  optimization: Optimization
  type?: 'apply' | 'accept'
  clientIds?: { user?: string; processing?: string }
  assistantMsgId?: string
}

/** 加载简历全文：优先使用缓存 chunks，回退到 PDF 解析 */
export async function loadResumeText(conversationId: string): Promise<string> {
  const typedChunks = await getConversationChunksWithTypes(conversationId)
  const cachedChunks = typedChunks.map((c) => ({
    pageContent: c.pageContent,
    metadata: c.metadata
  }))

  if (cachedChunks.length > 0) {
    return mergeOverlappingChunks(cachedChunks)
  }

  const originals = await getConversationDocsByType(conversationId, 'original')
  if (originals.length === 0 || !originals[0].file_path) {
    throw new NotFoundError('Original resume PDF not found')
  }
  const pdfPath = originals[0].file_path
  if (!fs.existsSync(pdfPath)) {
    throw new NotFoundError('PDF file not found on disk')
  }

  const pdfBuffer = fs.readFileSync(pdfPath)
  const text = await extractPdfText(pdfBuffer)
  if (text.trim().length < 100) {
    throw new ValidationError(
      '无法从 PDF 提取文本内容，可能是图片型 PDF。请重新上传包含文本的 PDF 文件。'
    )
  }
  return text
}

/** 核心：AI 修改简历 + 生成新 PDF + 文件存储 + 重新索引（返回 streaming） */
export function createApplyStream(params: ApplyModificationParams) {
  const { conversationId, optimization, type, clientIds, assistantMsgId } = params
  const { field, current, suggestion, reason } = optimization
  const perfStart = Date.now()

  return createUIMessageStream({
    ...(assistantMsgId ? { generateId: () => assistantMsgId } : {}),
    async execute({ writer }) {
      const fullText = await loadResumeText(conversationId)

      const userDisplay = `采纳建议修改：${field}`
      const userFull = `采纳建议：${field}\n原文：${current}\n建议：${suggestion}${reason ? '\n原因：' + reason : ''}`

      const t0 = performance.now()
      const promptFn = (type || 'apply') === 'accept' ? buildAcceptPrompt : buildApplyPrompt
      const response = await getChatModel().invoke([
        {
          role: 'user',
          content: await promptFn({ fullText, field, current, suggestion, reason: reason || '' })
        }
      ])
      const newContent = typeof response.content === 'string' ? response.content.trim() : ''
      logger.debug('Apply modification AI generation finished', {
        conversationId,
        field,
        durationMs: Math.round(performance.now() - t0),
        newContentLength: newContent.length
      })

      const newFullText = replaceText(fullText, current.trim(), newContent)
      logger.debug('Apply modification text replaced', {
        conversationId,
        field,
        newFullTextLength: newFullText.length
      })

      const sections = parseResumeSections(newFullText)
      const aiContent = sectionsToContentArray(sections)

      logger.debug('Apply modification PDF generation started', { conversationId, field })
      const pdfBuffer = Buffer.from(await generateResumePDF(structuredClone(aiContent)))

      const fileName = `resume_${Date.now()}.pdf`
      const preparedFile = prepareConversationFile(Buffer.from(pdfBuffer), 'pdf')

      const updatedRAG = new DocumentLoader()
      await updatedRAG.loadDocumentsFromText([
        { text: newFullText, metadata: { source: 'updated' } }
      ])
      const updatedChunks = updatedRAG.chunks.map((chunk) => ({
        pageContent: chunk.pageContent,
        metadata: chunk.metadata,
        role: 'modified' as const,
        category: 'resume'
      }))

      let transactionResult: {
        insertedFile: { refId: number; globalDocId: number; version: number }
        filesToDelete: string[]
      }
      try {
        transactionResult = await db.transaction(async (tx) => {
          const insertedFile = await insertConversationFileRef(tx, {
            conversationId,
            preparedFile,
            originalName: fileName,
            fileType: 'pdf',
            role: 'modified',
            contentSnapshot: newFullText
          })

          const filesToDelete = await cleanupOldVersionsInTransaction(
            tx,
            conversationId,
            'modified',
            5
          )

          await setConversationChunksWithTypesInTransaction(
            tx,
            conversationId,
            updatedChunks,
            insertedFile.refId
          )

          await storeMessageInTransaction(
            tx,
            conversationId,
            'user',
            userFull,
            undefined,
            clientIds?.user,
            userDisplay
          )
          await storeMessageInTransaction(
            tx,
            conversationId,
            'assistant',
            `正在处理「${field}」...`,
            undefined,
            clientIds?.processing
          )
          await storeMessageInTransaction(
            tx,
            conversationId,
            'assistant',
            `已采纳建议并生成修改内容`,
            undefined,
            assistantMsgId
          )

          return { insertedFile, filesToDelete }
        })
      } catch (error) {
        if (preparedFile.isNewPhysicalFile) {
          try {
            if (fs.existsSync(preparedFile.filePath)) fs.unlinkSync(preparedFile.filePath)
          } catch (cleanupError) {
            logger.error('Failed to delete orphan modified resume file after transaction failure', {
              conversationId,
              field,
              filePath: preparedFile.filePath,
              error: cleanupError
            })
          }
        }
        throw error
      }

      const fileResult = transactionResult.insertedFile
      for (const filePath of transactionResult.filesToDelete) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        } catch (error) {
          logger.error('Failed to delete old modified resume file after transaction commit', {
            conversationId,
            field,
            filePath,
            error
          })
        }
      }

      logger.debug('Apply modification completed', {
        conversationId,
        field,
        durationMs: Date.now() - perfStart,
        refId: fileResult.refId
      })

      // Tool stream: 告知前端 PDF 已生成
      const toolCallId = `tool-pdf-${Date.now()}`
      const toolStream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'tool-input-available',
            toolCallId,
            toolName: 'generateResumePDF',
            input: {},
            dynamic: true
          })
          controller.enqueue({
            type: 'tool-output-available',
            toolCallId,
            output: {
              pdfUrl: `/documents/${fileResult.refId}/download`,
              fileName,
              refId: fileResult.refId
            },
            dynamic: true
          })
          controller.close()
        }
      })
      writer.merge(toolStream)

      logger.debug('Conversation chunks rebuilt after modification', {
        conversationId,
        chunkCount: updatedRAG.chunks.length
      })

      triggerAutoSummary(conversationId)
    }
  })
}

/** Markdown → PDF 渲染 */
export async function renderResumePdf(markdown: string): Promise<Buffer> {
  if (!markdown || typeof markdown !== 'string') {
    throw new ValidationError('markdown text is required')
  }
  const sections = parseResumeSections(markdown)
  const contentArray = sectionsToContentArray(sections)
  return Buffer.from(await generateResumePDF(structuredClone(contentArray)))
}
