import { Queue } from 'bullmq'
import { REDIS_URL } from './config'

const connection = { url: REDIS_URL }

export const docParseQueue = new Queue('doc-parse', {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
})

export const emailQueue = new Queue('email', {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
})

export const pdfQueue = new Queue('pdf-generate', {
  connection,
  defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 3000 } }
})

export const systemDocIndexQueue = new Queue('system-doc-index', {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
})

export async function closeQueues(): Promise<void> {
  await Promise.all([
    docParseQueue.close(),
    emailQueue.close(),
    pdfQueue.close(),
    systemDocIndexQueue.close()
  ])
}
