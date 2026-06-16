import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { sanitizeLogValue } from '../src/lib/logger'

describe('logger', () => {
  it('redacts sensitive fields recursively', () => {
    const sanitized = sanitizeLogValue({
      authorization: 'Bearer token',
      user: {
        password: 'secret',
        profile: { nickname: 'zhang' }
      },
      items: [{ apiKey: 'key', value: 1 }]
    })

    expect(sanitized).toEqual({
      authorization: '[Redacted]',
      user: {
        password: '[Redacted]',
        profile: { nickname: 'zhang' }
      },
      items: [{ apiKey: '[Redacted]', value: 1 }]
    })
  })

  it('serializes errors without dropping the message', () => {
    const error = new Error('boom')
    const sanitized = sanitizeLogValue({ error }) as { error: { name: string; message: string } }

    expect(sanitized.error.name).toBe('Error')
    expect(sanitized.error.message).toBe('boom')
  })

  it('persists sanitized json lines when file logging is enabled', async () => {
    const originalEnv = { ...process.env }
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resuchat-logs-'))
    const logFile = 'test.log'

    try {
      process.env.LOG_TO_FILE = 'true'
      process.env.LOG_DIR = logDir
      process.env.LOG_FILE = logFile
      process.env.LOG_LEVEL = 'debug'
      process.env.LOG_FORMAT = 'json'

      const { vi } = await import('vitest')
      vi.resetModules()
      const { logger } = await import('../src/lib/logger')

      logger.info('file event', {
        ok: true,
        password: 'secret',
        nested: { authorization: 'Bearer token' }
      })

      const content = fs.readFileSync(path.join(logDir, logFile), 'utf8').trim()
      const event = JSON.parse(content) as Record<string, unknown>

      expect(event).toMatchObject({
        level: 'info',
        msg: 'file event',
        ok: true,
        password: '[Redacted]',
        nested: { authorization: '[Redacted]' }
      })
      expect(typeof event.time).toBe('string')
    } finally {
      process.env = originalEnv
      const { vi } = await import('vitest')
      vi.resetModules()
      fs.rmSync(logDir, { recursive: true, force: true })
    }
  })
})
