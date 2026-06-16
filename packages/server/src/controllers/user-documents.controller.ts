import type { Request, RequestHandler, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { ValidatedQueryRequest } from '../middleware/validate'
import { ValidationError } from '../lib/errors'
import { decodeFilename } from '../lib/text'
import {
  cancelParseUserDocumentForUser,
  getUserDocumentDownloadInfo,
  importConversationRefToUserLibrary,
  deleteUserDocumentForUser,
  listUserDocumentsForUser,
  renameUserDocumentForUser,
  retryParseUserDocumentForUser,
  uploadUserDocumentAndQueueParse
} from '../services/document/user-documents.service'

export const uploadUserDoc: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const file = req.file
  if (!file) {
    throw new ValidationError('File is required')
  }
  const result = await uploadUserDocumentAndQueueParse(
    userId,
    file.buffer,
    decodeFilename(file.originalname)
  )
  res.json({ message: 'Uploaded successfully', id: result.id })
}

export const listUserDocs: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const { search, fileType, contentCategory, parseStatus, page, pageSize } = (
    req as ValidatedQueryRequest<{
      search?: string
      fileType?: string
      contentCategory?: string
      parseStatus?: string
      page: number
      pageSize: number
    }>
  ).validatedQuery!
  const result = await listUserDocumentsForUser(userId, {
    search,
    fileType,
    category: contentCategory,
    parseStatus,
    page,
    pageSize
  })
  res.json({ data: result.data, pagination: { page, pageSize, total: result.total } })
}

export const renameUserDoc: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const id = parseInt(String(req.params.id))
  const { localName } = req.body as { localName: string }
  await renameUserDocumentForUser(userId, id, localName)
  res.json({ message: 'Renamed successfully' })
}

export const importToUserDocs: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const { refId } = req.body as { refId: number }
  await importConversationRefToUserLibrary(userId, parseInt(String(refId)))
  res.json({ message: 'Saved to library' })
}

export const downloadUserDoc: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const id = parseInt(String(req.params.id))
  const file = await getUserDocumentDownloadInfo(userId, id)
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(file.originalName)}"`
  )
  res.setHeader('Content-Length', file.buffer.length)
  res.send(file.buffer)
}

export const retryParseUserDoc: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const id = parseInt(String(req.params.id))
  await retryParseUserDocumentForUser(userId, id)
  res.json({ message: 'Parse started' })
}

export const cancelParseUserDoc: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const id = parseInt(String(req.params.id))
  await cancelParseUserDocumentForUser(userId, id)
  res.json({ message: 'Parse cancelled' })
}

export const deleteUserDoc: RequestHandler = async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).auth!.userId
  const id = parseInt(String(req.params.id))
  await deleteUserDocumentForUser(userId, id)
  res.json({ message: 'Deleted successfully' })
}
