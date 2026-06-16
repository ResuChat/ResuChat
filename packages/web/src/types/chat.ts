export interface OptimizationItem {
  field: string
  current: string
  suggestion: string
  reason?: string
  priority: '高' | '中' | '低'
}

export interface ModificationItem {
  field: string
  current: string
  suggestion: string
  reason?: string
}

export interface MessageAttachment {
  type: 'reference'
  source: 'upload' | 'library'
  name: string
  refId?: number
  globalDocId?: number
  docId?: number
  fileType?: string
  fileSize?: number
  category?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageAttachment[]
  reasoning?: string
  showReasoning?: boolean
  createdAt?: number
  optimizations?: OptimizationItem[]
  modifications?: ModificationItem[]
  status?: 'streaming' | 'completed' | 'interrupted'
}

export interface QueuedRequest {
  id: string
  type: 'search' | 'apply' | 'accept'
  label: string
  execute: () => void
  canceled: boolean
  timestamp: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  disabledKey?: string
  wasSupplement?: boolean
  dragging?: boolean
  dragOver?: boolean
  meta?: { text?: string }
}
