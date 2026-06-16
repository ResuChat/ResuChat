import { DocumentLoader } from '../../lib/document/loader'
import { getConversationChunksWithTypes, getConversationDocs } from '../../storage/repository'
import {
  getConversationDocsByType,
  listEffectivelyActiveSystemDocumentGroupIds
} from '../../storage/document/file-manager'
import { mergeOverlappingChunks } from '../../lib/text'
import { searchSystemChunks } from '../../lib/document/vector-db'
import type { MulterFile } from '../../lib/file-content'
import { processFileAsReference, processDocIdsAsReference } from './file-processor.service'
import fs from 'fs'
import path from 'path'
import type { RagContext } from '../../types/api'
import { logger } from '../../lib/logger'

export type { RagContext } from '../../types/api'

export async function buildRagContext(params: {
  query: string
  files?: MulterFile[]
  docIds?: number[]
  conversationId: string
  userId?: string
}): Promise<RagContext> {
  const { query, files, docIds, conversationId, userId } = params

  let resumeContent = ''
  let excellentResumeContent = ''
  let referenceDocContent = ''
  const attachments: RagContext['attachments'] = []
  const resumeChunks: { pageContent: string }[] = []
  const excellentResumeChunks: { pageContent: string; refId?: number }[] = []
  const referenceDocChunks: { pageContent: string; refId?: number }[] = []

  const loadChunksStartedAt = Date.now()
  const typedChunks = await getConversationChunksWithTypes(conversationId)
  logger.debug('Conversation chunks loaded', {
    conversationId,
    chunkCount: typedChunks.length,
    durationMs: Date.now() - loadChunksStartedAt
  })
  if (typedChunks.length > 0) {
    for (const chunk of typedChunks) {
      if (chunk.role === 'reference' && chunk.category === 'resume') {
        excellentResumeChunks.push(chunk)
      } else if (chunk.role === 'reference') {
        referenceDocChunks.push(chunk)
      } else if (chunk.category === 'resume') {
        resumeChunks.push(chunk)
      } else {
        referenceDocChunks.push(chunk)
      }
    }
    resumeContent = mergeOverlappingChunks(resumeChunks)

    if (excellentResumeChunks.length > 0) {
      const refDocs = await getConversationDocsByType(conversationId, 'reference')
      const nameByRefId: Record<number, string> = {}
      for (const d of refDocs) {
        nameByRefId[d.id] = d.local_name || d.original_name
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
        nameByRefId[d.id] = d.local_name || d.original_name
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
  } else {
    const conversationDocs = await getConversationDocs(conversationId)
    logger.debug('Conversation docs loaded as chunk fallback', {
      conversationId,
      docCount: conversationDocs.length
    })
    if (conversationDocs.length > 0) {
      const docDir = path.dirname(conversationDocs[0])
      logger.debug('Loading fallback docs from directory', { conversationId, docDir })
      if (fs.existsSync(docDir)) {
        const docRAG = new DocumentLoader()
        await docRAG.loadDocuments(docDir)
        logger.debug('Fallback docs loaded', {
          conversationId,
          chunkCount: docRAG.chunks.length
        })
        for (const chunk of docRAG.chunks) {
          resumeChunks.push(chunk)
        }
        resumeContent = mergeOverlappingChunks(resumeChunks)
      }
    }
  }

  try {
    const activeGroupIds = await listEffectivelyActiveSystemDocumentGroupIds()
    const searchableResults =
      activeGroupIds.length === 0
        ? []
        : (
            await searchSystemChunks(query, {
              k: 12,
              activeGroupIds
            })
          ).slice(0, 3)
    if (searchableResults.length > 0) {
      const sysText = '【系统知识库相关参考】\n' + searchableResults.map((r) => r.text).join('\n\n')
      if (referenceDocContent) {
        referenceDocContent += '\n\n' + sysText
      } else {
        referenceDocContent = sysText
      }
    }
  } catch (error) {
    logger.warn('System vector search failed', { conversationId, error })
  }

  const processedHashes = new Set<string>()

  // 文档库引用 -> 对话参考资料
  if (userId && docIds && docIds.length > 0) {
    const docResults = await processDocIdsAsReference(
      docIds,
      userId,
      conversationId,
      processedHashes
    )
    for (const r of docResults) {
      attachments.push(r.attachment)
      if (r.category === 'resume') {
        excellentResumeContent += r.contentLabel + r.fileContent + '\n\n'
      } else {
        referenceDocContent += r.contentLabel + r.fileContent + '\n\n'
      }
    }
  }

  // 上传文件 -> 对话参考资料
  if (files && files.length > 0) {
    for (const file of files) {
      const r = await processFileAsReference({
        file,
        conversationId,
        processedHashes,
        syncToUserLibrary: true,
        userId: userId ?? undefined
      })
      if (!r) continue
      attachments.push(r.attachment)
      if (r.category === 'resume') {
        excellentResumeContent += r.contentLabel + r.fileContent + '\n\n'
      } else {
        referenceDocContent += r.contentLabel + r.fileContent + '\n\n'
      }
    }
  }

  return { resumeContent, excellentResumeContent, referenceDocContent, attachments }
}
