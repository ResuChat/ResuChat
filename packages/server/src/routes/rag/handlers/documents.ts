import { Router, Request, Response } from 'express'
import { PDFParse } from 'pdf-parse'
import fs from 'fs'
import { DocumentLoader } from '../../../lib/document-loader'
import {
  parseAIContent,
  parseResumeSections,
  sectionsToContentArray,
  generateResumePDF
} from '../../../lib/resume-pdfmaker'
import {
  addFileToConversation,
  cleanupOldVersions,
  getConversationDocsByType
} from '../../../storage/file-manager'
import {
  setConversationChunksWithTypes,
  storeMessage,
  isConversationOwner
} from '../../../storage/repository'
import { getDatabase } from '../../../storage/database'
import { createAuthMiddleware, createAuthWithUserMiddleware } from '../../../auth/token'

const authMiddleware = createAuthMiddleware()
const authWithUser = createAuthWithUserMiddleware()
const router: Router = Router()

router.get('/docs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.query
    if (!conversationId) {
      res.status(400).json({ error: 'conversationId is required' })
      return
    }
    const docs = await getConversationDocsByType(conversationId as string, 'reference')
    res.json({ docs })
  } catch (error) {
    console.error('Error getting docs:', error)
    res.status(500).json({ error: 'Failed to get documents' })
  }
})

router.get('/docs/:conversationId/history', authWithUser, async (req: Request, res: Response) => {
  try {
    const conversationId = String(req.params.conversationId)
    const userId = (req as any).userId as number
    const isOwner = await isConversationOwner(conversationId, userId)
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
    const originals = await getConversationDocsByType(conversationId as string, 'original')
    const modified = await getConversationDocsByType(conversationId as string, 'modified')
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
    res.json({ versions })
  } catch (error) {
    console.error('Error getting doc history:', error)
    res.status(500).json({ error: 'Failed to get document history' })
  }
})

router.delete('/docs/:refId', authWithUser, async (req: Request, res: Response) => {
  try {
    const refId = parseInt(req.params.refId as string)
    const conversationId = req.query.conversationId as string
    if (!conversationId) {
      res.status(400).json({ error: 'conversationId query param is required' })
      return
    }
    const userId = (req as any).userId as number
    const isOwner = await isConversationOwner(conversationId, userId)
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
    const { removeFileFromConversation } = await import('../../../storage/file-manager')
    await removeFileFromConversation(conversationId, refId)
    res.json({ message: 'Document removed' })
  } catch (error) {
    console.error('Error deleting document:', error)
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

router.post('/docs/:refId/restore', authWithUser, async (req: Request, res: Response) => {
  try {
    const refId = parseInt(req.params.refId as string)
    const userId = (req as any).userId as number
    const db = getDatabase()

    const ref = db
      .prepare(
        'SELECT r.conversation_id, g.file_path, r.content_snapshot, r.version FROM conversation_document_refs r JOIN global_documents g ON r.global_doc_id = g.id WHERE r.id = ?'
      )
      .get(refId) as
      | {
          conversation_id: string
          file_path: string
          content_snapshot: string | null
          version: number
        }
      | undefined

    if (!ref) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    const isOwner = await isConversationOwner(ref.conversation_id, userId)
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    let fullText: string

    if (ref.content_snapshot) {
      fullText = ref.content_snapshot
    } else {
      if (!fs.existsSync(ref.file_path)) {
        res.status(404).json({ error: 'File not found on disk' })
        return
      }
      const pdfBuffer = fs.readFileSync(ref.file_path)
      const pdfParser = new PDFParse({ data: pdfBuffer })
      const pdfData = await pdfParser.getText()
      await pdfParser.destroy()
      fullText = pdfData.text
        .replace(/--\s*\d+\s*of\s*\d+\s*--/g, '')
        .replace(/(?:Page|第)\s*\d+\s*(?:of|\/)\s*\d+/gi, '')
        .replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, '')
        .trim()
    }

    if (fullText.length < 100) {
      res.status(400).json({ error: '该版本 PDF 不包含可恢复的文本内容' })
      return
    }

    const updatedRAG = new DocumentLoader()
    await updatedRAG.loadDocumentsFromText([{ text: fullText, metadata: { source: 'restored' } }])
    const updatedChunks = updatedRAG.chunks.map((chunk) => ({
      pageContent: chunk.pageContent,
      metadata: chunk.metadata,
      docType: 'resume' as const
    }))
    await setConversationChunksWithTypes(ref.conversation_id, updatedChunks)

    await storeMessage(ref.conversation_id, 'assistant', `已恢复到版本 v${ref.version}`)

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

    res.json({
      message: 'Restored successfully',
      downloadUrl: `/rag/docs/${fileResult.refId}/download`,
      refId: fileResult.refId
    })
  } catch (error) {
    console.error('Error restoring document:', error)
    res.status(500).json({ error: 'Failed to restore document' })
  }
})

router.get('/docs/:refId/download', authWithUser, async (req: Request, res: Response) => {
  try {
    const refId = parseInt(req.params.refId as string)
    const userId = (req as any).userId as number
    const db = getDatabase()

    const ref = db
      .prepare(
        'SELECT r.conversation_id, g.file_path, g.file_type, g.original_name FROM conversation_document_refs r JOIN global_documents g ON r.global_doc_id = g.id WHERE r.id = ?'
      )
      .get(refId) as
      | {
          conversation_id: string
          file_path: string
          file_type: string
          original_name: string
        }
      | undefined

    if (!ref) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    const isOwner = await isConversationOwner(ref.conversation_id, userId)
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!fs.existsSync(ref.file_path)) {
      res.status(404).json({ error: 'File not found on disk' })
      return
    }

    const fileBuffer = fs.readFileSync(ref.file_path)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(ref.original_name)}"`
    )
    res.setHeader('Content-Length', fileBuffer.length)
    res.send(fileBuffer)
  } catch (error) {
    console.error('Error serving document:', error)
    res.status(500).json({ error: 'Failed to serve document' })
  }
})

export default router
