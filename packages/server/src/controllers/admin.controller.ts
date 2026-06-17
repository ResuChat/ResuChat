import type { Request, RequestHandler, Response } from 'express'
import { NotFoundError } from '../lib/errors'
import { decodeFilename } from '../lib/text'
import {
  uploadSystemDocument,
  deleteSystemDocument,
  listSystemDocuments,
  getSystemDocument,
  updateSystemDocumentActive,
  listSystemGroups,
  createSystemGroup,
  updateSystemGroup,
  deleteSystemGroup
} from '../services/document/admin.service'
import type { SystemDocUploadRequest, SystemDocPatchRequest } from '../dto/admin.dto'
import type { SystemDocGroupRequest, SystemDocGroupPatchRequest } from '../dto/admin.dto'

export const uploadDoc: RequestHandler = async (req: Request, res: Response) => {
  const { groupId } = req.body as SystemDocUploadRequest
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'File is required' })
    return
  }

  const result = await uploadSystemDocument(
    file.buffer,
    decodeFilename(file.originalname),
    groupId,
    file.mimetype
  )
  res.status(202).json({ message: 'System document queued', ...result })
}

export const deleteDoc: RequestHandler = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string)
  await deleteSystemDocument(id)
  res.json({ message: 'System document deleted' })
}

export const listDocs: RequestHandler = async (_req: Request, res: Response) => {
  const data = await listSystemDocuments()
  res.json({ data })
}

export const getDoc: RequestHandler = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string)
  const row = await getSystemDocument(id)
  if (!row) throw new NotFoundError('System document not found')
  res.json({ data: row })
}

export const patchDoc: RequestHandler = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10)
  const { active } = req.body as SystemDocPatchRequest
  const result = await updateSystemDocumentActive(id, active === 1)
  res.json({ data: result })
}

export const listGroups: RequestHandler = async (_req: Request, res: Response) => {
  const data = await listSystemGroups()
  res.json({ data })
}

export const createGroup: RequestHandler = async (req: Request, res: Response) => {
  const { name, parentId } = req.body as SystemDocGroupRequest
  const data = await createSystemGroup(name, parentId ?? null)
  res.status(201).json({ data })
}

export const patchGroup: RequestHandler = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10)
  const body = req.body as SystemDocGroupPatchRequest
  const data = await updateSystemGroup(id, body)
  res.json({ data })
}

export const removeGroup: RequestHandler = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10)
  await deleteSystemGroup(id)
  res.json({ message: 'System document group deleted' })
}
