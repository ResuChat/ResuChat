import type { Request, Response, NextFunction } from 'express'
import type { ZodSchema } from 'zod'

export interface ValidatedQueryRequest<T = unknown> extends Request {
  validatedQuery?: T
}

/** 校验 req.body */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      })
      return
    }
    req.body = result.data
    next()
  }
}

/** 校验 req.query */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      })
      return
    }
    ;(req as ValidatedQueryRequest).validatedQuery = result.data
    next()
  }
}
