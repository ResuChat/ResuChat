import { Worker, type Job } from 'bullmq'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  CONVERSATION_TRASH_PURGE_INTERVAL_MS,
  LOGIN_HISTORY_PURGE_INTERVAL_MS,
  LOGIN_HISTORY_RETENTION_MS,
  REDIS_URL,
  SHUTDOWN_TIMEOUT
} from '../lib/config'
import {
  parseUserDocumentFromFile,
  resetParsingUserDocuments,
  resetPendingUserDocuments
} from '../services/document/user-documents.service'
import {
  processSystemDocumentIndexing,
  requeuePendingSystemDocumentIndexing
} from '../services/document/admin.service'
import { logger } from '../lib/logger'
import { closeDb } from '../lib/db'
import { purgeExpiredDeletedConversations } from '../services/document/conversation.service'
import { resetStuckStreamingMessages } from '../services/chat/stream-persistence.service'
import { deleteLoginHistoryBefore } from '../storage/user/users'

const connection = { url: REDIS_URL }
const workers: Worker[] = []
let startupPromise: Promise<void> | null = null
let conversationTrashPurgeInterval: NodeJS.Timeout | null = null
let loginHistoryPurgeInterval: NodeJS.Timeout | null = null

type SystemDocIndexJob = { systemDocId: number }

function registerWorker(worker: Worker) {
  worker.on('completed', (job) => {
    logger.info('Queue job completed', {
      queue: worker.name,
      jobId: job.id
    })
  })
  worker.on('failed', (job, error, prev) => {
    logger.error('Queue job failed', {
      queue: worker.name,
      jobId: job?.id ?? 'unknown',
      prev,
      error
    })
  })
  worker.on('stalled', (jobId, prev) => {
    logger.warn('Queue job stalled and requeued', {
      queue: worker.name,
      jobId,
      prev
    })
  })
  worker.on('lockRenewalFailed', (jobIds) => {
    logger.warn('Queue job lock renewal failed', {
      queue: worker.name,
      jobIds
    })
  })
  worker.on('error', (error) => {
    logger.error('Queue worker error', { queue: worker.name, error })
  })
  worker.on('closed', () => {
    logger.info('Queue worker closed', { queue: worker.name })
  })
  workers.push(worker)
  return worker
}

function registerWorkers(): void {
  // ── 文档解析 Worker ──
  registerWorker(
    new Worker(
      'doc-parse',
      async (job: Job<{ docId: number; filePath: string; originalName: string }>) => {
        const { docId, filePath, originalName } = job.data
        logger.info('Queue doc parse started', { docId, originalName })
        await parseUserDocumentFromFile(docId, filePath, originalName)
      },
      { connection, concurrency: 2 }
    )
  )

  // ── 系统知识库入库 Worker ──
  registerWorker(
    new Worker(
      'system-doc-index',
      async (job: Job<SystemDocIndexJob>) => {
        const { systemDocId } = job.data
        logger.info('Queue system document indexing started', { systemDocId })
        await processSystemDocumentIndexing(systemDocId)
      },
      { connection, concurrency: 1 }
    )
  )

  // ── 邮件 Worker ──
  registerWorker(
    new Worker(
      'email',
      async (job: Job<{ to: string; subject: string; text: string; html: string }>) => {
        const { to, subject, text, html } = job.data
        logger.info('Queue email sending', { to, subject })
        const nodemailer = await import('nodemailer')
        const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = await import('../lib/config')
        const transporter = nodemailer.default.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: false,
          auth: { user: SMTP_USER, pass: SMTP_PASS }
        })
        const info = await transporter.sendMail({ from: SMTP_USER, to, subject, text, html })
        logger.info('Queue email sent', { to, messageId: info.messageId })
      },
      { connection, concurrency: 3 }
    )
  )

  // ── PDF 生成 Worker ──
  registerWorker(
    new Worker(
      'pdf-generate',
      async (job: Job<{ markdown: string; userId?: string }>) => {
        const { markdown, userId } = job.data
        logger.info('Queue PDF generation started', { userId, markdownLength: markdown.length })
        const { generateResumePDF, parseAIContent } = await import('../lib/pdf/pdfmaker')
        const content = parseAIContent(markdown)
        return Buffer.from(await generateResumePDF(content))
      },
      { connection, concurrency: 1 }
    )
  )
}

async function runWorkerStartupTasks(): Promise<void> {
  const cleanedParsing = await resetParsingUserDocuments()
  if (cleanedParsing > 0) {
    logger.warn('Queue reset stuck parsing docs', { count: cleanedParsing })
  }
  const cleanedPending = await resetPendingUserDocuments()
  if (cleanedPending > 0) {
    logger.warn('Queue reset stuck pending docs', { count: cleanedPending })
  }
  const requeuedSystemDocs = await requeuePendingSystemDocumentIndexing()
  if (requeuedSystemDocs > 0) {
    logger.warn('Queue requeued pending system documents', { count: requeuedSystemDocs })
  }
  const stuckStreaming = await resetStuckStreamingMessages()
  if (stuckStreaming > 0) {
    logger.warn('Queue reset stuck streaming messages', { count: stuckStreaming })
  }
  await runConversationTrashPurge()
  await runLoginHistoryPurge()
}

async function runConversationTrashPurge(): Promise<void> {
  try {
    const result = await purgeExpiredDeletedConversations()
    if (result.conversationsDeleted > 0 || result.globalDocumentsDeleted > 0) {
      logger.info('Expired deleted conversations purged', result)
    }
  } catch (error) {
    logger.error('Expired deleted conversation purge failed', { error })
  }
}

function scheduleConversationTrashPurge(): void {
  if (conversationTrashPurgeInterval) return
  conversationTrashPurgeInterval = setInterval(() => {
    void runConversationTrashPurge()
  }, CONVERSATION_TRASH_PURGE_INTERVAL_MS)
  conversationTrashPurgeInterval.unref()
}

async function runLoginHistoryPurge(): Promise<void> {
  try {
    const cutoffLoginAt = Date.now() - LOGIN_HISTORY_RETENTION_MS
    const deletedCount = await deleteLoginHistoryBefore(cutoffLoginAt)
    if (deletedCount > 0) {
      logger.info('Expired login history purged', { deletedCount, cutoffLoginAt })
    }
  } catch (error) {
    logger.error('Expired login history purge failed', { error })
  }
}

function scheduleLoginHistoryPurge(): void {
  if (loginHistoryPurgeInterval) return
  loginHistoryPurgeInterval = setInterval(() => {
    void runLoginHistoryPurge()
  }, LOGIN_HISTORY_PURGE_INTERVAL_MS)
  loginHistoryPurgeInterval.unref()
}

export async function startWorkers(): Promise<void> {
  if (startupPromise) return await startupPromise

  startupPromise = (async () => {
    registerWorkers()
    logger.info('Queue workers started')
    await runWorkerStartupTasks()
    scheduleConversationTrashPurge()
    scheduleLoginHistoryPurge()
  })()

  return await startupPromise
}

async function runShutdownStep(name: string, action: () => Promise<void>): Promise<void> {
  logger.info('Queue shutdown step started', { step: name })
  await action()
  logger.info('Queue shutdown step completed', { step: name })
}

export async function closeWorkers(force = false): Promise<void> {
  if (conversationTrashPurgeInterval) {
    clearInterval(conversationTrashPurgeInterval)
    conversationTrashPurgeInterval = null
  }
  if (loginHistoryPurgeInterval) {
    clearInterval(loginHistoryPurgeInterval)
    loginHistoryPurgeInterval = null
  }
  await Promise.all(
    workers.map(async (worker) => {
      logger.info('Queue worker closing', { queue: worker.name, force })
      await worker.close(force)
    })
  )
}

let shuttingDown = false
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('Queue shutdown signal received', { signal })

  const forceExit = setTimeout(() => {
    logger.error('Queue forced shutdown after timeout', { timeoutMs: SHUTDOWN_TIMEOUT })
    process.exit(1)
  }, SHUTDOWN_TIMEOUT).unref()

  try {
    await runShutdownStep('workers', () => closeWorkers(true))
    await runShutdownStep('db', closeDb)
    clearTimeout(forceExit)
    logger.info('Queue shutdown completed')
    process.exit(0)
  } catch (error) {
    clearTimeout(forceExit)
    logger.error('Queue shutdown failed', { error })
    process.exit(1)
  }
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMainModule) {
  startWorkers().catch((error) => {
    logger.error('Queue worker startup failed', { error })
    process.exit(1)
  })

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
  process.on('unhandledRejection', (reason) => {
    logger.error('Queue unhandled rejection', { reason })
  })
  process.on('uncaughtException', (error) => {
    logger.error('Queue uncaught exception', { error })
    void gracefulShutdown('uncaughtException')
  })
}
