import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getFastModel } from '../../../lib/providers'
import { DocumentLoader } from '../../../lib/document-loader'
import { addFileToConversation, cleanupOldVersions } from '../../../storage/file-manager'
import {
  createConversation,
  setConversationChunksWithTypes,
  appendConversationChunks
} from '../../../storage/repository'
import { getDatabase } from '../../../storage/database'
import { createAuthMiddleware } from '../../../auth/token'
import {
  decodeFilename,
  classifyReferenceFile,
  extractUserId,
  parseFileContent,
  upload,
  MulterFile
} from '../utils'

const uploadProgress = new Map<string, { progress: number; status: string }>()
const authMiddleware = createAuthMiddleware()
const router: Router = Router()

router.get('/start/progress/:convId', authMiddleware, async (req: Request, res: Response) => {
  const data = uploadProgress.get(String(req.params.convId))
  if (!data) return res.json({ progress: 100, status: '完成' })
  res.json(data)
})

router.post(
  '/start',
  authMiddleware,
  upload.array('files'),
  async (req: Request, res: Response) => {
    req.setTimeout(240000)
    let tempDir: string | null = null
    try {
      const conversationId = `conv_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
      uploadProgress.set(conversationId, {
        progress: 0,
        status: '正在准备...'
      })
      const files = req.files as MulterFile[]
      const query = req.body.query

      const userId = await extractUserId(req)
      const initialPrompt = query && query.trim() ? query.trim() : ''
      if (userId) {
        await createConversation(conversationId, userId, initialPrompt)
      }

      let firstMarkdownText = ''
      let firstOriginalRefId = 0

      if (files && files.length > 0) {
        tempDir = path.join(process.cwd(), 'temp', conversationId)
        fs.mkdirSync(tempDir, { recursive: true })

        const decodedFiles = files.map((file) => ({
          ...file,
          originalname: decodeFilename(file.originalname)
        }))

        let totalChunkCount = 0
        let firstFile = true
        for (const file of decodedFiles) {
          const safeName = path.basename(file.originalname)
          const filePath = path.join(tempDir, safeName)
          fs.writeFileSync(filePath, file.buffer)

          const fileType = file.originalname.toLowerCase().endsWith('.pdf')
            ? 'pdf'
            : file.originalname.toLowerCase().endsWith('.docx')
              ? 'docx'
              : 'txt'
          const result = await addFileToConversation(
            conversationId,
            file.buffer,
            file.originalname,
            fileType,
            'original'
          )
          const fileContent = await parseFileContent(file)

          const classification = await classifyReferenceFile(fileContent)
          if (classification !== 'excellent_resume') {
            res.status(400).json({ error: '上传文件不是简历，请上传简历文件' })
            return
          }

          uploadProgress.set(conversationId, {
            progress: 30,
            status: '正在解析为结构化格式...'
          })

          const markdownResponse = await getFastModel().invoke(
            [
              {
                role: 'user',
                content: `将以下简历文本转换为结构化 Markdown 格式。用 ## 标题分层，保留全部内容。\n\n${fileContent}`
              }
            ],
            { signal: AbortSignal.timeout(120000) }
          )
          let markdownText =
            typeof markdownResponse.content === 'string' ? markdownResponse.content : fileContent
          const mdMatch = markdownText.match(/```(?:markdown)?\s*([\s\S]*?)```/)
          if (mdMatch) {
            markdownText = mdMatch[1].trim()
          } else {
            const headingStart = markdownText.search(/^#{1,3}\s/m)
            if (headingStart > 0) markdownText = markdownText.slice(headingStart)
          }
          uploadProgress.set(conversationId, {
            progress: 80,
            status: '正在构建索引...'
          })

          const fileRAG = new DocumentLoader()
          await fileRAG.loadDocumentsFromText([
            {
              text: markdownText,
              metadata: { source: file.originalname, file_type: 'resume' }
            }
          ])

          const typedChunks = fileRAG.chunks.map((chunk) => ({
            pageContent: chunk.pageContent,
            metadata: chunk.metadata,
            docType: 'resume' as const
          }))
          totalChunkCount += typedChunks.length

          if (firstFile) {
            firstMarkdownText = markdownText
            firstOriginalRefId = result.refId
            getDatabase()
              .prepare('UPDATE conversation_document_refs SET content_snapshot = ? WHERE id = ?')
              .run(markdownText, result.refId)
            await setConversationChunksWithTypes(conversationId, typedChunks, result.refId)
            firstFile = false
          } else {
            await appendConversationChunks(conversationId, typedChunks, result.refId)
          }
        }
        await cleanupOldVersions(conversationId, 'original', 5)

        console.log('Parsed and cached', totalChunkCount, 'chunks for conversation', conversationId)
      }

      uploadProgress.set(conversationId, { progress: 100, status: '完成' })
      setTimeout(() => uploadProgress.delete(conversationId), 30000)

      res.json({
        conversationId,
        initialPrompt,
        resumeContent: firstMarkdownText,
        originalRefId: firstOriginalRefId
      })
    } catch (error) {
      console.error('Error starting conversation:', error)
      res.status(500).json({ error: 'Failed to start conversation' })
    } finally {
      if (tempDir) {
        try {
          if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (cleanupErr) {
          console.error('Failed to clean up temp dir:', cleanupErr)
        }
      }
    }
  }
)

export default router
