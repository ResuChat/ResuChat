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

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  showReasoning?: boolean
  createdAt?: number
  optimizations?: OptimizationItem[]
  modifications?: ModificationItem[]
  status?: 'streaming' | 'completed' | 'interrupted'
}
