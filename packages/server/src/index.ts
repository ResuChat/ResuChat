import 'dotenv/config'
import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import authRoute from './routes/auth'
import userRoute from './routes/user'
import conversationRoute from './routes/conversation'
import adminRoute from './routes/admin'
import chatRoute from './routes/chat'
import documentsRoute from './routes/documents'
import modifyRoute from './routes/modify'
import userDocumentsRoute from './routes/user-documents'
import { closeDb } from './lib/db'
import { AppError } from './lib/errors'
import {
  ALLOWED_ORIGINS,
  BIND_ADDRESS,
  BODY_LIMIT,
  PORT,
  SHUTDOWN_TIMEOUT,
  START_WORKER_IN_SERVER
} from './lib/config'
import { tokenCleanupInterval } from './services/auth.service'
import { captchaCleanupInterval } from './services/captcha.service'
import { emailCleanupInterval } from './services/email.service'
import { closeWebSocketServer, initWebSocket } from './services/ws.service'
import { warmupEmbedding } from './lib/ai/providers'
import { closeRedis } from './lib/redis'
import { closeQueues } from './lib/queue'
import { httpLogger, logger } from './lib/logger'

type BlockingStdout = NodeJS.WriteStream & {
  _handle?: {
    setBlocking(blocking: boolean): void
  }
}

// 强制 stdout 无缓冲（Windows 上 console.log 输出不刷新的问题）
if (process.stdout.isTTY) {
  ;(process.stdout as BlockingStdout)._handle?.setBlocking(true)
}

const app: Express = express()

app.use(helmet())
app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true)
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
      logger.warn('CORS origin blocked', { origin })
      return callback(null, false)
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'token',
      'Token',
      'X-Phone',
      'X-Requested-With'
    ],
    credentials: true
  })
)

// 认证端点速率限制
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' }
})
app.use('/auth/login', authLimiter)
app.use('/auth/register', authLimiter)
app.use('/auth/send-email-code', authLimiter)

app.use(express.json({ limit: BODY_LIMIT }))
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }))

// 静态文件服务：头像
app.use('/avatars', express.static(path.join(process.cwd(), 'uploads', 'avatars')))

app.use(httpLogger)

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'AI Agent BFF Layer Running' })
})

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

app.use('/admin', adminRoute)
app.use('/auth', authRoute)
app.use('/user', userRoute)
app.use('/conversations', conversationRoute)
app.use('/chat', chatRoute)
app.use('/documents', documentsRoute)
app.use('/user-documents', userDocumentsRoute)
app.use('/modify', modifyRoute)

// 全局错误处理中间件
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Unhandled app error', { error: err, statusCode: err.statusCode })
    }
    res.status(err.statusCode).json({
      error: err.expose ? err.message : 'Internal server error'
    })
    return
  }
  logger.error('Unhandled error', { error: err })
  res.status(500).json({ error: 'Internal server error' })
})

logger.info('Routes registered')

async function runShutdownStep(name: string, action: () => Promise<void>): Promise<void> {
  logger.info('Shutdown step started', { step: name })
  await action()
  logger.info('Shutdown step completed', { step: name })
}

export async function start() {
  let closeInProcessWorkers: (() => Promise<void>) | null = null
  const server = app.listen(PORT, BIND_ADDRESS)

  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError)
      logger.info('Server started', { address: BIND_ADDRESS, port: PORT })
      resolve()
    }
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }

    server.once('listening', onListening)
    server.once('error', onError)
  })

  server.on('error', (error) => {
    logger.error('HTTP server error', { error })
  })

  initWebSocket(server)

  if (START_WORKER_IN_SERVER) {
    const workerModule = await import('./workers/index')
    await workerModule.startWorkers()
    closeInProcessWorkers = () => workerModule.closeWorkers(true)
    logger.info('In-process queue workers started')
  }

  // 预加载嵌入模型，避免首次请求阻塞
  warmupEmbedding().catch((error) => logger.error('Embedding preload failed', { error }))

  let shuttingDown = false
  async function gracefulShutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('Shutdown signal received', { signal })
    clearInterval(tokenCleanupInterval)
    clearInterval(captchaCleanupInterval)
    if (emailCleanupInterval) clearInterval(emailCleanupInterval)

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout', { timeoutMs: SHUTDOWN_TIMEOUT })
      process.exit(1)
    }, SHUTDOWN_TIMEOUT).unref()

    try {
      await runShutdownStep('websocket', closeWebSocketServer)
      await runShutdownStep('http', async () => {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error)
            else resolve()
          })
        })
      })
      if (closeInProcessWorkers) {
        await runShutdownStep('workers', closeInProcessWorkers)
      }
      await runShutdownStep('queue', closeQueues)
      await runShutdownStep('redis', closeRedis)
      await runShutdownStep('db', closeDb)
      clearTimeout(forceExit)
      logger.info('Shutdown completed')
      process.exit(0)
    } catch (error) {
      clearTimeout(forceExit)
      logger.error('Graceful shutdown failed', { error })
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'))

  return server
}

if (process.env.VITEST !== 'true') {
  start().catch((err) => {
    logger.error('Fatal startup error', { error: err })
    process.exit(1)
  })
}

export default app
