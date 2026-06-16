import type { Request, RequestHandler, Response } from 'express'
import fs from 'fs'
import { ValidationError } from '../lib/errors'
import {
  getDocuments,
  getHistory,
  deleteDocument,
  restoreDocument,
  downloadDocument
} from '../services/document/documents.service'
export const listDocs: RequestHandler = async (req: Request, res: Response) => {
  const { conversationId } = req.query
  if (!conversationId) {
    throw new ValidationError('conversationId is required')
  }
  const docs = await getDocuments(conversationId as string)
  res.json({ docs })
}

export const docHistory: RequestHandler = async (req: Request, res: Response) => {
  const conversationId = String(req.params.conversationId)
  const versions = await getHistory(conversationId)
  res.json({ versions })
}

export const removeDoc: RequestHandler = async (req: Request, res: Response) => {
  const refId = parseInt(req.params.refId as string)
  const conversationId = req.query.conversationId as string
  if (!conversationId) {
    throw new ValidationError('conversationId query param is required')
  }
  await deleteDocument(conversationId, refId)
  res.json({ message: 'Document removed' })
}

export const restoreDoc: RequestHandler = async (req: Request, res: Response) => {
  const refId = parseInt(req.params.refId as string)
  const result = await restoreDocument(refId)
  res.json({ message: 'Restored successfully', ...result })
}

export const downloadDoc: RequestHandler = async (req: Request, res: Response) => {
  const refId = parseInt(req.params.refId as string)
  const { filePath, originalName } = await downloadDocument(refId)
  const fileBuffer = fs.readFileSync(filePath)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`)
  res.setHeader('Content-Length', fileBuffer.length)
  res.send(fileBuffer)
}
