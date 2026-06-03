import { Router, Request, Response } from 'express'
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai'
import { PDFParse } from 'pdf-parse'
import fs from 'fs'
import { getChatModel } from '../../../lib/providers'
import { buildApplyPrompt, buildAcceptPrompt } from '../../../lib/prompts'
import {
  parseAIContent,
  parseResumeSections,
  sectionsToContentArray,
  generateResumePDF
} from '../../../lib/resume-pdfmaker'
import { replaceText } from '../../../lib/resume-markdown'
import { DocumentLoader } from '../../../lib/document-loader'
import {
  addFileToConversation,
  cleanupOldVersions,
  getConversationDocsByType
} from '../../../storage/file-manager'
import {
  getConversationChunksWithTypes,
  setConversationChunksWithTypes,
  isConversationOwner,
  storeMessage
} from '../../../storage/repository'
import { createAuthMiddleware, createAuthWithUserMiddleware } from '../../../auth/token'
import { mergeOverlappingChunks, upload } from '../utils'

const authMiddleware = createAuthMiddleware()
const authWithUser = createAuthWithUserMiddleware()
const router: Router = Router()

router.post(
  '/apply-modification',
  authWithUser,
  upload.none(),
  async (req: Request, res: Response) => {
    try {
      const { conversationId, optimization, type, clientIds, assistantMsgId } = req.body
      const userId = (req as any).userId as number
      const isOwner = await isConversationOwner(conversationId as string, userId)
      if (!isOwner) {
        res.status(403).json({ error: 'Access denied' })
        return
      }
      let parsedOptimization
      if (typeof optimization === 'string') {
        try {
          parsedOptimization = JSON.parse(optimization)
        } catch {
          res.status(400).json({ error: 'Invalid optimization JSON format' })
          return
        }
      } else {
        parsedOptimization = optimization
      }

      if (!conversationId || !parsedOptimization) {
        res.status(400).json({ error: 'conversationId and optimization are required' })
        return
      }

      const { field, current, suggestion, reason } = parsedOptimization
      if (!field || !suggestion) {
        res.status(400).json({ error: 'field and suggestion are required' })
        return
      }
      if (!current) {
        res.status(400).json({ error: 'current is required for text positioning' })
        return
      }

      const typedChunks = await getConversationChunksWithTypes(conversationId)
      const cachedChunks = typedChunks.map((c) => ({
        pageContent: c.pageContent,
        metadata: c.metadata
      }))
      let fullText = ''

      if (cachedChunks.length > 0) {
        fullText = mergeOverlappingChunks(cachedChunks)
        console.log(
          '[apply-modification] using cached chunks:',
          cachedChunks.length,
          'total length:',
          fullText.length
        )
      } else {
        console.log('[apply-modification] no cached chunks, loading from PDF')
        const originals = await getConversationDocsByType(conversationId, 'original')
        if (originals.length === 0 || !originals[0].file_path) {
          console.error('[apply-modification] no original PDF found')
          res.status(404).json({ error: 'Original resume PDF not found' })
          return
        }
        const pdfPath = originals[0].file_path

        if (!fs.existsSync(pdfPath)) {
          console.warn('[apply-modification] PDF not found:', pdfPath)
          res.status(404).json({ error: 'PDF file not found on disk' })
          return
        }

        const pdfBuffer = fs.readFileSync(pdfPath)
        const pdfParser = new PDFParse({ data: pdfBuffer })
        const pdfData = await pdfParser.getText()
        await pdfParser.destroy()
        fullText = pdfData.text

        if (fullText.trim().length < 100) {
          res.status(400).json({
            error: '无法从 PDF 提取文本内容，可能是图片型 PDF。请重新上传包含文本的 PDF 文件。'
          })
          return
        }
      }

      await storeMessage(conversationId, 'user', `采纳建议修改：${field}`, undefined, clientIds?.user)
      const perfStart = Date.now()

      const stream = createUIMessageStream({
        ...(assistantMsgId ? { generateId: () => assistantMsgId } : {}),
        async execute({ writer }) {
          const t0 = performance.now()
          const promptFn = (type || 'apply') === 'accept' ? buildAcceptPrompt : buildApplyPrompt
          const response = await getChatModel().invoke([
            {
              role: 'user',
              content: await promptFn({
                fullText,
                field,
                current,
                suggestion,
                reason: reason || ''
              })
            }
          ])
          const newContent = typeof response.content === 'string' ? response.content.trim() : ''
          console.log('[perf] AI generateText:', performance.now() - t0, 'ms')
          console.log('[DEBUG] newContent length:', newContent.length)

          const newFullText = replaceText(fullText, current.trim(), newContent)
          console.log('[DEBUG] newFullText length:', newFullText.length)
          console.log('[DEBUG] newFullText first 500:', newFullText.slice(0, 500))

          const sections = parseResumeSections(newFullText)
          const aiContent = sectionsToContentArray(sections)
          console.log('[DEBUG] content items:', aiContent.length)

          console.log('[perf] PDF generation')
          const pdfBuffer = await generateResumePDF(structuredClone(aiContent))
          console.log('[perf] PDF generation')
          console.log(
            '[DEBUG] pdfBuffer.length:',
            pdfBuffer.length,
            'content items:',
            aiContent.length
          )

          console.log('[perf] addFileToConversation')
          const fileName = `resume_${Date.now()}.pdf`
          const fileResult = await addFileToConversation(
            conversationId,
            Buffer.from(pdfBuffer),
            fileName,
            'pdf',
            'modified',
            undefined,
            newFullText
          )
          console.log('[perf] addFileToConversation')

          await cleanupOldVersions(conversationId, 'modified', 5)
          console.log('[perf] total (since handler):', Date.now() - perfStart, 'ms')

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
                  pdfUrl: `/rag/docs/${fileResult.refId}/download`,
                  fileName,
                  refId: fileResult.refId
                },
                dynamic: true
              })
              controller.close()
            }
          })
          writer.merge(toolStream)

          const updatedRAG = new DocumentLoader()
          await updatedRAG.loadDocumentsFromText([
            { text: newFullText, metadata: { source: 'updated' } }
          ])

          const updatedChunks = updatedRAG.chunks.map((chunk) => ({
            pageContent: chunk.pageContent,
            metadata: chunk.metadata,
            docType: 'resume' as const
          }))
          await setConversationChunksWithTypes(conversationId, updatedChunks)
          console.log(
            'Updated',
            updatedRAG.chunks.length,
            'chunks for conversation',
            conversationId
          )

          await storeMessage(conversationId, 'assistant', `正在处理「${field}」...`, undefined, clientIds?.processing)
          await storeMessage(conversationId, 'assistant', `已采纳建议并生成修改内容`, undefined, assistantMsgId)
        }
      })

      pipeUIMessageStreamToResponse({ response: res as any, stream })
    } catch (error) {
      console.error('Error applying modification:', error)
      res.status(500).json({ error: 'Failed to apply modification' })
    }
  }
)

router.post(
  '/render-resume-pdf',
  authMiddleware,
  upload.none(),
  async (req: Request, res: Response) => {
    try {
      const { markdown } = req.body
      if (!markdown || typeof markdown !== 'string') {
        res.status(400).json({ error: 'markdown text is required' })
        return
      }
      const sections = parseResumeSections(markdown)
      const contentArray = sectionsToContentArray(sections)
      const pdfBuffer = await generateResumePDF(structuredClone(contentArray))
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', pdfBuffer.length)
      res.send(Buffer.from(pdfBuffer))
    } catch (error) {
      console.error('Error rendering resume PDF:', error)
      res.status(500).json({ error: 'Failed to render resume PDF' })
    }
  }
)

export default router
