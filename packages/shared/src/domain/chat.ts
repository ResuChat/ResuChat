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

export interface MessageRecord {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  client_id?: string
  status?: string
  display_content?: string
  attachments?: MessageAttachment[]
  created_at: number
}

export interface Conversation {
  id: string
  user_id: string
  title: string | null
  status: string
  created_at: number
  updated_at: number
}
