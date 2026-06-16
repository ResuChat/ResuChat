import type { DocumentCategory } from '../domain/document'

export interface SystemDocumentRecord {
  id: number
  global_doc_id: number
  group_id: number | null
  category: DocumentCategory
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
}

export interface SystemDocumentGroup {
  id: number
  parent_id: number | null
  name: string
  active: boolean
  document_count: number
  created_at: number
  updated_at: number
}
