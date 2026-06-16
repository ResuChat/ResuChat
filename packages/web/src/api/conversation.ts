import { api } from './client'
import type { ConversationMessagesResponse, ConversationsResponse } from '@/types/api'

export async function getConversations(page = 1, pageSize = 20): Promise<ConversationsResponse> {
  return api.get<ConversationsResponse, ConversationsResponse>('/conversations', {
    params: { page, pageSize }
  })
}

export async function getConversationMessages(
  id: string,
  page = 1,
  pageSize = 100,
  order: 'ASC' | 'DESC' = 'DESC',
  before?: string
): Promise<ConversationMessagesResponse> {
  const params: Record<string, unknown> = { page, pageSize, order }
  if (before !== undefined) params.before = before
  return api.get<ConversationMessagesResponse, ConversationMessagesResponse>(
    `/conversations/${id}/messages`,
    { params }
  )
}

export async function deleteConversation(id: string): Promise<void> {
  return api.delete<void, void>(`/conversations/${id}`)
}
