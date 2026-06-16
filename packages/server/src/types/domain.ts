import type {
  UserRole,
  MessageAttachment,
  MessageRecord,
  Conversation,
  SystemDocumentGroup
} from '@resuchat/shared'

export type { UserRole, MessageAttachment, MessageRecord, Conversation, SystemDocumentGroup }

export interface User {
  id: string
  phone: string | null
  email?: string | null
  password?: string | null
  nickname: string
  role: UserRole
  created_at: number
  updated_at: number
}

// Messages
export interface Message {
  role: 'user' | 'assistant'
  content: string
}
export interface Document {
  id: number
  conversation_id: string
  file_path: string
  file_url: string
  original_name: string
  local_name?: string
  source_user_document_id?: number | null
  file_type: string
  file_size: number
  created_at: number
  role: string
}

// Chunks
export interface Chunk {
  pageContent: string
  metadata: Record<string, unknown>
}

export interface TypedChunk {
  pageContent: string
  metadata: Record<string, unknown>
  role: 'original' | 'reference' | 'modified'
  refId?: number
  scope?: string
  category?: string
}

// File Manager
export interface FileAddResult {
  globalDocId: number
  refId: number
  filePath: string
  isNewFile: boolean
  version: number
  category?: string
}

export interface DocumentRef {
  id: number
  conversation_id: string
  file_path: string
  file_type: string
  original_name: string
  content_snapshot: string | null
  version: number
}

export interface ConversationDocInfo {
  id: number
  original_name: string
  local_name: string
  source_user_document_id: number | null
  file_type: string
  file_size: number
  file_path: string
  role: string
  version: number
  created_at: number
  category?: string
}

export interface SystemDocRecord {
  id: number
  global_doc_id: number
  group_id: number | null
  category: 'resume' | 'job' | 'unknown'
  group_name: string
  local_name: string
  active: boolean
  index_status: 'pending' | 'indexing' | 'done' | 'failed'
  error_message: string | null
  chunks_count: number
  indexed_at: number | null
  created_at: number
  updated_at: number
  file_type: string
  file_size: number
  original_name: string
  file_path?: string
}
