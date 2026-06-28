import type { Request, RequestHandler, Response } from 'express'
import { pipeUIMessageStreamToResponse } from 'ai'
import { createApplyStream, renderResumePdf } from '../services/document/modify.service'

export const applyModification: RequestHandler = async (req: Request, res: Response) => {
  const { conversationId, optimization, type, clientIds, assistantMsgId } = req.body
  const stream = createApplyStream({
    conversationId,
    optimization,
    type,
    clientIds,
    assistantMsgId
  })

  pipeUIMessageStreamToResponse({ response: res, stream })
}

export const renderPdf: RequestHandler = async (req: Request, res: Response) => {
  const { markdown } = req.body
  const pdfBuffer = await renderResumePdf(markdown)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Length', pdfBuffer.length)
  res.send(Buffer.from(pdfBuffer))
}
