export type DocumentCategory = 'resume' | 'job' | 'unknown'

export type ConversationDocumentRole = 'original' | 'reference' | 'modified'

export interface DocumentRecord {
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

export interface ReferenceDoc {
  id: number
  original_name: string
  local_name?: string
  source_user_document_id?: number | null
  file_type: string
  file_size: number
  file_path: string
  role: string
  category?: string
  version: number
  created_at: number
}

export interface DocVersion {
  refId: number
  type: 'original' | 'modified'
  version: number
  fileName: string
  fileSize: number
  createdAt: number
}
