import type { Conversation, MessageRecord } from '../domain/chat'
import type { DocumentRecord } from '../domain/document'

export interface ConversationsResponse {
  data: Conversation[]
  pagination: { page: number; pageSize: number; total: number }
}

export interface ConversationMessagesResponse {
  data: {
    messages: MessageRecord[]
    documents: DocumentRecord[]
    initialPrompt: string | null
    title?: string | null
    resumeContent?: string
    originalRefId?: number
  }
  pagination: { page?: number; pageSize: number; total: number; nextCursor?: string | null }
}
