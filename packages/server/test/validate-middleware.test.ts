import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateQuery, type ValidatedQueryRequest } from '../src/middleware/validate'
import { SearchRequest } from '../src/dto/chat.dto'

function createJsonResponseRecorder() {
  let statusCode = 200
  let payload: unknown

  const response = {
    status(code: number) {
      statusCode = code
      return response
    },
    json(body: unknown) {
      payload = body
      return response
    }
  }

  return {
    response: response as unknown as Response,
    getStatusCode: () => statusCode,
    getPayload: () => payload
  }
}

describe('validateQuery', () => {
  it('should attach validated query to request', () => {
    const schema = z.object({
      page: z.coerce.number().int().min(1),
      search: z.string().optional()
    })
    const middleware = validateQuery(schema)
    const req = { query: { page: '2', search: 'resume' } } as Request & ValidatedQueryRequest
    const { response } = createJsonResponseRecorder()
    let called = false

    middleware(req, response, (() => {
      called = true
    }) as NextFunction)

    expect(called).toBe(true)
    expect(req.validatedQuery).toEqual({ page: 2, search: 'resume' })
  })

  it('should reject invalid query', () => {
    const schema = z.object({
      page: z.coerce.number().int().min(1)
    })
    const middleware = validateQuery(schema)
    const req = { query: { page: '0' } } as Request & ValidatedQueryRequest
    const { response, getPayload, getStatusCode } = createJsonResponseRecorder()

    middleware(req, response, (() => {
      throw new Error('should not call next')
    }) as NextFunction)

    expect(getStatusCode()).toBe(400)
    expect((getPayload() as { error: string }).error).toBe('Validation failed')
  })
})

describe('SearchRequest', () => {
  it('should reject search without conversationId', () => {
    const result = SearchRequest.safeParse({
      query: '参考文档优化',
      docIds: [1]
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.conversationId?.[0]).toBeDefined()
    }
  })

  it('should allow document references with conversationId', () => {
    const result = SearchRequest.safeParse({
      query: '参考文档优化',
      conversationId: 'conv_123',
      assistantMsgId: 'assistant_123',
      docIds: [1]
    })

    expect(result.success).toBe(true)
  })
})
