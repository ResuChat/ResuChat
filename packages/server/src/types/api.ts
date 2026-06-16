import type { MessageAttachment } from './domain'

export interface StartResult {
  conversationId: string
  initialPrompt: string
  resumeContent: string
  originalRefId: number
}

export interface UploadResult {
  globalDocId: number
  systemDocId: number
  jobId: string
  indexStatus: 'pending' | 'indexing' | 'done' | 'failed'
}

export interface RagContext {
  resumeContent: string
  excellentResumeContent: string
  referenceDocContent: string
  attachments: MessageAttachment[]
}
