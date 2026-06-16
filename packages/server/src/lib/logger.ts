import fs from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import pino from 'pino'
import pinoHttp from 'pino-http'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogFields = Record<string, unknown>

const SENSITIVE_KEY_RE = /(authorization|token|secret|password|passwd|apikey|api_key|cookie)/i
const LOG_LEVEL = parseLogLevel(process.env.LOG_LEVEL)
const LOG_FORMAT =
  process.env.LOG_FORMAT ||
  (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' ? 'json' : 'pretty')
const LOG_TO_FILE = process.env.LOG_TO_FILE === 'true'
const LOG_DIR = process.env.LOG_DIR || 'logs'
const LOG_FILE = process.env.LOG_FILE || 'app.log'

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') return value
  return process.env.NODE_ENV === 'test' ? 'warn' : 'info'
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[MaxDepth]'
  if (value instanceof Error) return serializeError(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, depth + 1))
  if (!value || typeof value !== 'object') return value

  const result: LogFields = {}
  for (const [key, child] of Object.entries(value as LogFields)) {
    result[key] = SENSITIVE_KEY_RE.test(key) ? '[Redacted]' : sanitizeLogValue(child, depth + 1)
  }
  return result
}

function serializeError(error: Error): LogFields {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause:
      error.cause instanceof Error ? serializeError(error.cause) : sanitizeLogValue(error.cause)
  }
}

function createLogStream(): pino.DestinationStream {
  const streams: pino.StreamEntry[] = [
    {
      level: LOG_LEVEL,
      stream:
        LOG_FORMAT === 'pretty'
          ? pino.transport({
              target: 'pino-pretty',
              options: {
                colorize: process.stdout.isTTY,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
              }
            })
          : pino.destination(1)
    }
  ]

  if (LOG_TO_FILE) {
    const target = path.resolve(process.cwd(), LOG_DIR, LOG_FILE)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    streams.push({
      level: LOG_LEVEL,
      stream: pino.destination({ dest: target, sync: true, mkdir: true })
    })
  }

  return pino.multistream(streams)
}

const baseLogger = pino(
  {
    level: LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label }
      }
    }
  },
  createLogStream()
)

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  baseLogger[level](sanitizeLogValue(fields) as LogFields, message)
}

function requestPath(req: IncomingMessage): string | undefined {
  return req.url?.split('?')[0]
}

function requestIp(req: IncomingMessage): string | undefined {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0]?.trim()
  if (Array.isArray(forwardedFor)) return forwardedFor[0]
  return req.socket.remoteAddress
}

function httpLogFields(
  req: IncomingMessage,
  res: ServerResponse,
  responseTime?: number
): LogFields {
  return sanitizeLogValue({
    method: req.method,
    path: requestPath(req),
    statusCode: res.statusCode,
    durationMs: responseTime,
    ip: requestIp(req),
    userAgent: req.headers['user-agent']
  }) as LogFields
}

export const httpLogger = pinoHttp({
  logger: baseLogger,
  quietReqLogger: true,
  quietResLogger: true,
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  customSuccessMessage(_req, res) {
    return res.statusCode >= 400 ? 'HTTP request rejected' : 'HTTP request completed'
  },
  customErrorMessage() {
    return 'HTTP request failed'
  },
  customSuccessObject(req, res, value) {
    return httpLogFields(req, res, value.responseTime)
  },
  customErrorObject(req, res, error, value) {
    return {
      ...httpLogFields(req, res, value.responseTime),
      error: sanitizeLogValue(error)
    }
  }
})

export const logger = {
  debug(message: string, fields?: LogFields) {
    write('debug', message, fields)
  },
  info(message: string, fields?: LogFields) {
    write('info', message, fields)
  },
  warn(message: string, fields?: LogFields) {
    write('warn', message, fields)
  },
  error(message: string, fields?: LogFields) {
    write('error', message, fields)
  }
}

export { baseLogger }
