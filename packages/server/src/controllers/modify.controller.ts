import type { Request, RequestHandler, Response } from 'express'
import { pipeUIMessageStreamToResponse } from 'ai'
import { ValidationError } from '../lib/errors'
import { createApplyStream, renderResumePdf } from '../services/document/modify.service'

export const applyModification: RequestHandler = async (req: Request, res: Response) => {
  const { conversationId, optimization, type, clientIds, assistantMsgId } = req.body

  let parsedOptimization
  if (typeof optimization === 'string') {
    try {
      parsedOptimization = JSON.parse(optimization)
    } catch {
      throw new ValidationError('Invalid optimization JSON format')
    }
  } else {
    parsedOptimization = optimization
  }

  if (!conversationId || !parsedOptimization) {
    throw new ValidationError('conversationId and optimization are required')
  }

  const { field, current, suggestion, reason } = parsedOptimization
  if (!field || !suggestion) {
    throw new ValidationError('field and suggestion are required')
  }
  if (!current) {
    throw new ValidationError('current is required for text positioning')
  }

  const stream = createApplyStream({
    conversationId,
    optimization: { field, current, suggestion, reason },
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
