import 'dotenv/config'
import { logger } from '../src/lib/logger'
import {
  dropSystemVectorTable,
  systemVectorTableNeedsMetadataRebuild
} from '../src/lib/document/vector-db'

let queuesLoaded = false
let dbLoaded = false

function hasOnlyKnownArgs(args: string[]): boolean {
  return args.every((arg) => arg === '--check' || arg === '--force')
}

async function requeueAllSystemDocuments(): Promise<number> {
  const [{ systemDocIndexQueue }, { listSystemDocuments, updateSystemDocumentIndexState }] =
    await Promise.all([import('../src/lib/queue'), import('../src/storage/document/file-manager')])
  queuesLoaded = true
  dbLoaded = true

  const docs = await listSystemDocuments()

  for (const doc of docs) {
    await updateSystemDocumentIndexState(doc.id, {
      status: 'pending',
      chunksCount: 0,
      errorMessage: null,
      indexedAt: null
    })
    const job = await systemDocIndexQueue.add('index', { systemDocId: doc.id })
    logger.info('System document indexing queued by vector rebuild script', {
      systemDocId: doc.id,
      previousStatus: doc.index_status,
      jobId: job.id
    })
  }

  return docs.length
}

async function closeResources(): Promise<void> {
  if (queuesLoaded) {
    const { closeQueues } = await import('../src/lib/queue')
    await closeQueues().catch((error) => {
      logger.error('Failed to close queues after vector rebuild script', { error })
    })
  }
  if (dbLoaded) {
    const { closeDb } = await import('../src/lib/db')
    await closeDb().catch((error) => {
      logger.error('Failed to close db after vector rebuild script', { error })
    })
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (!hasOnlyKnownArgs(args)) {
    throw new Error(
      'Usage: vite-node --config vite.config.ts scripts/rebuild-system-vectors.ts [--check] [--force]'
    )
  }

  const checkOnly = args.includes('--check')
  const force = args.includes('--force')
  const needsRebuild = await systemVectorTableNeedsMetadataRebuild()

  if (checkOnly) {
    if (needsRebuild) {
      logger.warn('System vector table metadata is stale; rebuild required')
      process.exitCode = 1
    } else {
      logger.info('System vector table metadata is ready')
    }
    return
  }

  if (!force && !needsRebuild) {
    logger.info('System vector rebuild skipped; metadata is ready. Use --force to rebuild anyway')
    return
  }

  const dropped = await dropSystemVectorTable()
  const queuedCount = await requeueAllSystemDocuments()
  logger.warn('System vector rebuild prepared', {
    force,
    metadataWasStale: needsRebuild,
    tableDropped: dropped,
    queuedCount
  })
}

main()
  .catch((error) => {
    logger.error('System vector rebuild script failed', { error })
    process.exitCode = 1
  })
  .finally(async () => {
    await closeResources()
  })
