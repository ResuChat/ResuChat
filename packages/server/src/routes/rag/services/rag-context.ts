import { Request, Response } from 'express'
import { DocumentLoader } from '../../../lib/document-loader'
import {
  getConversationChunksWithTypes,
  getConversationDocs,
  appendConversationChunks
} from '../../../storage/repository'
import { getConversationDocsByType, addFileToConversation } from '../../../storage/file-manager'
import {
  decodeFilename,
  mergeOverlappingChunks,
  classifyReferenceFile,
  refCategoryLabel,
  parseFileContent,
  validateURL,
  MulterFile
} from '../utils'
import fs from 'fs'
import path from 'path'

export interface RagContext {
  resumeContent: string
  excellentResumeContent: string
  referenceDocContent: string
  rag: DocumentLoader
}

export async function buildRagContext(
  params: {
    query: string
    content?: string
    files?: MulterFile[]
    url?: string
    useSystemDocs: boolean
    conversationId?: string
    systemRAG: DocumentLoader
  },
  res: Response,
  req: Request
): Promise<RagContext | null> {
  const { query, content, files, url, useSystemDocs, conversationId, systemRAG } = params

  const rag = new DocumentLoader({ chunkSize: 1000, chunkOverlap: 200 })
  const tempDir = path.join(process.cwd(), 'temp', Date.now().toString())
  fs.mkdirSync(tempDir, { recursive: true })

  let resumeContent = ''
  let excellentResumeContent = ''
  let referenceDocContent = ''
  const resumeChunks: { pageContent: string }[] = []
  const excellentResumeChunks: { pageContent: string; refId?: number }[] = []
  const referenceDocChunks: { pageContent: string; refId?: number }[] = []

  try {
    if (conversationId) {
      console.log('[perf] load-chunks')
      const typedChunks = await getConversationChunksWithTypes(conversationId)
      console.log('[perf] load-chunks')
      if (typedChunks.length > 0) {
        console.log('conversationId:', conversationId, 'loaded typed chunks:', typedChunks.length)
        for (const chunk of typedChunks) {
          if (chunk.docType === 'resume') {
            resumeChunks.push(chunk)
          } else if (chunk.refCategory === 'excellent_resume') {
            excellentResumeChunks.push(chunk)
          } else {
            referenceDocChunks.push(chunk)
          }
          rag.chunks.push(chunk)
        }
        resumeContent = mergeOverlappingChunks(resumeChunks)

        if (excellentResumeChunks.length > 0) {
          const refDocs = await getConversationDocsByType(conversationId, 'reference')
          const nameByRefId: Record<number, string> = {}
          for (const d of refDocs) {
            nameByRefId[d.id] = d.original_name
          }
          const groups: Record<number, { pageContent: string }[]> = {}
          for (const c of excellentResumeChunks) {
            const key = c.refId || 0
            if (!groups[key]) groups[key] = []
            groups[key].push(c)
          }
          const parts: string[] = []
          for (const [refIdStr, chunks] of Object.entries(groups)) {
            const rid = Number(refIdStr)
            const name = rid ? nameByRefId[rid] : undefined
            const merged = mergeOverlappingChunks(chunks)
            parts.push(name ? `--- ${name} ---\n${merged}` : merged)
          }
          excellentResumeContent = parts.join('\n\n')
        }

        if (referenceDocChunks.length > 0) {
          const refDocs = await getConversationDocsByType(conversationId, 'reference')
          const nameByRefId: Record<number, string> = {}
          for (const d of refDocs) {
            nameByRefId[d.id] = d.original_name
          }
          const groups: Record<number, { pageContent: string }[]> = {}
          for (const c of referenceDocChunks) {
            const key = c.refId || 0
            if (!groups[key]) groups[key] = []
            groups[key].push(c)
          }
          const parts: string[] = []
          for (const [refIdStr, chunks] of Object.entries(groups)) {
            const rid = Number(refIdStr)
            const name = rid ? nameByRefId[rid] : undefined
            const merged = mergeOverlappingChunks(chunks)
            parts.push(name ? `--- ${name} ---\n${merged}` : merged)
          }
          referenceDocContent = parts.join('\n\n')
        }

        try {
          const { searchSystemChunks } = await import('../../../lib/vector-db')
          const sysResults = await searchSystemChunks(query, 3)
          if (sysResults.length > 0) {
            const sysText = '【系统知识库相关参考】\n' + sysResults.map((r) => r.text).join('\n\n')
            if (referenceDocContent) {
              referenceDocContent += '\n\n' + sysText
            } else {
              referenceDocContent = sysText
            }
          }
        } catch (e) {
          console.error('[vector-db] search error:', e)
        }
      } else {
        const conversationDocs = await getConversationDocs(conversationId)
        console.log('conversationId:', conversationId, 'docs:', conversationDocs)
        if (conversationDocs.length > 0) {
          const docDir = path.dirname(conversationDocs[0])
          console.log('loading docs from directory:', docDir)
          if (fs.existsSync(docDir)) {
            const docRAG = new DocumentLoader()
            await docRAG.loadDocuments(docDir)
            console.log('loaded chunks:', docRAG.chunks.length)
            for (const chunk of docRAG.chunks) {
              resumeChunks.push(chunk)
              rag.chunks.push(chunk)
            }
            resumeContent = mergeOverlappingChunks(resumeChunks)
          }
        }
      }
    }

    if (files && files.length > 0) {
      for (const file of files) {
        const decodedName = path.basename(decodeFilename(file.originalname))
        const filePath = path.join(tempDir, decodedName)
        fs.writeFileSync(filePath, file.buffer)

        const fileContent = await parseFileContent(file)
        const refCategory = await classifyReferenceFile(fileContent)
        const categoryLabel = refCategoryLabel(refCategory)
        if (refCategory === 'excellent_resume') {
          excellentResumeContent += `[${categoryLabel}: ${decodedName}]\n${fileContent}\n\n`
        } else {
          referenceDocContent += `[${categoryLabel}: ${decodedName}]\n${fileContent}\n\n`
        }

        if (conversationId) {
          const fileType = decodedName.toLowerCase().endsWith('.pdf')
            ? 'pdf'
            : decodedName.toLowerCase().endsWith('.docx')
              ? 'docx'
              : 'txt'
          const result = await addFileToConversation(
            conversationId,
            file.buffer,
            decodedName,
            fileType,
            'reference',
            refCategory || undefined
          )

          const fileRAG = new DocumentLoader()
          await fileRAG.loadDocumentsFromText([
            {
              text: fileContent,
              metadata: { source: decodedName, file_type: 'reference' }
            }
          ])

          const refChunks = fileRAG.chunks.map((chunk) => ({
            pageContent: `[${categoryLabel}: ${decodedName}]\n${chunk.pageContent}`,
            metadata: chunk.metadata,
            docType: 'reference' as const,
            refCategory: refCategory || undefined,
            scope: 'conversation'
          }))

          for (const chunk of refChunks) {
            rag.chunks.push(chunk)
          }

          await appendConversationChunks(conversationId, refChunks, result.refId)
        }
      }
    } else if (content) {
      await rag.loadDocumentsFromText([{ text: content, metadata: { source: 'inline' } }])
    } else if (url) {
      const urlResult = validateURL(url)
      if (!urlResult.valid) {
        res.status(400).json({ error: `URL rejected: ${urlResult.error}` })
        return null
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          res.status(502).json({ error: `Remote server returned ${response.status}` })
          return null
        }
        const contentLength = response.headers.get('content-length')
        if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
          res.status(413).json({ error: 'Response too large (>5MB)' })
          return null
        }
        const text = await response.text()
        if (text.length > 5 * 1024 * 1024) {
          res.status(413).json({ error: 'Response too large (>5MB)' })
          return null
        }
        await rag.loadDocumentsFromText([{ text, metadata: { source: url } }])
      } finally {
        clearTimeout(timeout)
      }
    }

    if (useSystemDocs) {
      for (const chunk of [...systemRAG.chunks]) {
        rag.chunks.push(chunk)
      }
    }

    return { resumeContent, excellentResumeContent, referenceDocContent, rag }
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}
