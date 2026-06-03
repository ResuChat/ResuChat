import crypto from 'crypto'

import fs from 'fs'
import path from 'path'
import { getDatabase } from './database'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'documents', 'by_hash')

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

export interface FileAddResult {
  globalDocId: number
  refId: number
  filePath: string
  isNewFile: boolean
  version: number
  refCategory?: string
}

export async function addFileToConversation(
  conversationId: string,
  fileBuffer: Buffer,
  originalName: string,
  fileType: string,
  docType: 'original' | 'reference' | 'modified' = 'reference',
  refCategory?: string,
  contentSnapshot?: string
): Promise<FileAddResult> {
  const db = getDatabase()
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  const fileSize = fileBuffer.length
  const fileName = `${fileHash}.${fileType}`
  const filePath = path.join(UPLOADS_DIR, fileName)

  // 先处理文件 I/O，避免在事务中阻塞
  const fileAlreadyExists = fs.existsSync(filePath)
  if (!fileAlreadyExists) {
    try {
      fs.writeFileSync(filePath, fileBuffer)
    } catch (err) {
      throw new Error(`File write failed: ${err}`, { cause: err })
    }
  }

  const transaction = db.transaction((txnDb) => {
    const existingGlobal = txnDb
      .prepare('SELECT id, file_path FROM global_documents WHERE file_hash = ?')
      .get(fileHash) as { id: number; file_path: string } | undefined

    let globalDocId: number
    let isNewFile = false

    if (existingGlobal) {
      globalDocId = existingGlobal.id
      txnDb
        .prepare('UPDATE global_documents SET reference_count = reference_count + 1 WHERE id = ?')
        .run(globalDocId)
    } else {
      const result = txnDb
        .prepare(
          `INSERT INTO global_documents (file_hash, file_path, original_name, file_type, file_size, reference_count, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)`
        )
        .run(fileHash, filePath, originalName, fileType, fileSize, Date.now())
      globalDocId = result.lastInsertRowid as number
      isNewFile = true
    }

    const currentVersion =
      (
        txnDb
          .prepare(
            'SELECT MAX(version) as max_version FROM conversation_document_refs WHERE conversation_id = ? AND doc_type = ?'
          )
          .get(conversationId, docType) as { max_version: number | null }
      )?.max_version || 0
    const newVersion = currentVersion + 1

    const refResult = txnDb
      .prepare(
        `INSERT INTO conversation_document_refs (conversation_id, global_doc_id, doc_type, version, local_name, created_at, ref_category, content_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        conversationId,
        globalDocId,
        docType,
        newVersion,
        originalName,
        Date.now(),
        refCategory || null,
        contentSnapshot || null
      )

    return {
      globalDocId,
      refId: refResult.lastInsertRowid as number,
      isNewFile,
      version: newVersion,
      refCategory
    }
  })

  const { globalDocId, refId, isNewFile, version } = transaction(db)

  return {
    globalDocId,
    refId,
    filePath,
    isNewFile,
    version
  }
}

export async function removeFileFromConversation(
  conversationId: string,
  refId: number
): Promise<void> {
  const db = getDatabase()
  const filesToDelete: string[] = []

  const transaction = db.transaction((txnDb) => {
    const refDoc = txnDb
      .prepare('SELECT global_doc_id FROM conversation_document_refs WHERE id = ?')
      .get(refId) as { global_doc_id: number } | undefined

    if (!refDoc) return

    txnDb
      .prepare(
        'UPDATE chunks SET deleted = 1 WHERE conversation_id = ? AND ref_id = ? AND deleted = 0'
      )
      .run(conversationId, refId)

    txnDb.prepare('DELETE FROM conversation_document_refs WHERE id = ?').run(refId)
    txnDb
      .prepare('UPDATE global_documents SET reference_count = reference_count - 1 WHERE id = ?')
      .run(refDoc.global_doc_id)

    const count = txnDb
      .prepare('SELECT reference_count FROM global_documents WHERE id = ?')
      .get(refDoc.global_doc_id) as { reference_count: number }

    if (count.reference_count <= 0) {
      const doc = txnDb
        .prepare('SELECT file_path FROM global_documents WHERE id = ?')
        .get(refDoc.global_doc_id) as { file_path: string }
      filesToDelete.push(doc.file_path)
      txnDb.prepare('DELETE FROM global_documents WHERE id = ?').run(refDoc.global_doc_id)
    }
  })

  transaction(db)

  for (const fp of filesToDelete) {
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp)
    } catch (err) {
      console.error('Failed to delete file:', fp, err)
    }
  }
}

export async function cleanupOldVersions(
  conversationId: string,
  docType: string,
  maxVersions: number = 5
): Promise<void> {
  const db = getDatabase()

  const refs = db
    .prepare(
      `SELECT id, global_doc_id FROM conversation_document_refs
       WHERE conversation_id = ? AND doc_type = ?
       ORDER BY version DESC`
    )
    .all(conversationId, docType) as { id: number; global_doc_id: number }[]

  if (refs.length > maxVersions) {
    const toRemove = refs.slice(maxVersions)
    const transaction = db.transaction((txnDb) => {
      for (const ref of toRemove) {
        txnDb.prepare('DELETE FROM conversation_document_refs WHERE id = ?').run(ref.id)
        txnDb
          .prepare('UPDATE global_documents SET reference_count = reference_count - 1 WHERE id = ?')
          .run(ref.global_doc_id)

        const count = txnDb
          .prepare('SELECT reference_count FROM global_documents WHERE id = ?')
          .get(ref.global_doc_id) as { reference_count: number }

        if (count.reference_count <= 0) {
          const doc = txnDb
            .prepare('SELECT file_path FROM global_documents WHERE id = ?')
            .get(ref.global_doc_id) as { file_path: string }
          if (fs.existsSync(doc.file_path)) {
            fs.unlinkSync(doc.file_path)
          }
          txnDb.prepare('DELETE FROM global_documents WHERE id = ?').run(ref.global_doc_id)
        }
      }
    })

    transaction(db)
  }
}

export async function getChunksForConversation(
  conversationId: string
): Promise<{ pageContent: string; metadata: Record<string, unknown> }[]> {
  const db = getDatabase()
  const rows = db
    .prepare(
      'SELECT page_content, metadata FROM chunks WHERE conversation_id = ? AND deleted = 0 ORDER BY chunk_index'
    )
    .all(conversationId) as { page_content: string; metadata: string }[]

  return rows.map((r) => ({
    pageContent: r.page_content,
    metadata: JSON.parse(r.metadata)
  }))
}

export interface ConversationDocInfo {
  id: number
  original_name: string
  file_type: string
  file_size: number
  file_path: string
  doc_type: string
  version: number
  created_at: number
  ref_category?: string
}

export async function getConversationDocsByType(
  conversationId: string,
  docType?: string
): Promise<ConversationDocInfo[]> {
  const db = getDatabase()
  let query = `
    SELECT r.id, g.original_name, g.file_type, g.file_size, g.file_path, r.doc_type, r.version, r.created_at, r.ref_category
    FROM conversation_document_refs r
    JOIN global_documents g ON r.global_doc_id = g.id
    WHERE r.conversation_id = ?
  `
  const params: any[] = [conversationId]

  if (docType) {
    query += ' AND r.doc_type = ?'
    params.push(docType)
  }

  query += ' ORDER BY r.created_at DESC'

  return db.prepare(query).all(...params) as ConversationDocInfo[]
}
