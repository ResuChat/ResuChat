import { api } from '@/api/client'
import { getConversationMessages } from '@/api/conversation'
import { renderResumePdf } from '@/api/document'
import type { Conversation, ConversationMessagesResponse, DocumentRecord } from '@/types/api'
import type { Message } from '@/types/chat'
import { mapApiMessage } from '@/lib/editor-utils'

export interface ConversationSnapshot {
  totalMessages: number
  initialPrompt: string
  messages: Message[]
  documents: DocumentRecord[]
  resumeContent: string
  originalRefId: number
  title: string
}

export interface ConversationPreviewBlob {
  blob: Blob
  fileName: string
}

export function getDocumentDownloadPath(fileUrl: string): string {
  const normalized = fileUrl.startsWith('/api') ? fileUrl : `/api${fileUrl}`
  return normalized.replace('/api', '')
}

export async function downloadDocumentBlob(fileUrl: string): Promise<Blob> {
  return (await api.get(getDocumentDownloadPath(fileUrl), {
    responseType: 'blob'
  })) as Blob
}

export function buildConversationSnapshot(
  result: ConversationMessagesResponse,
  conversations: Conversation[],
  conversationId: string
): ConversationSnapshot {
  const data = result.data
  const apiMessages = (data.messages ?? []).reverse()
  const documents = data.documents ?? []

  return {
    totalMessages: result.pagination?.total ?? apiMessages.length,
    initialPrompt: data.initialPrompt ?? '',
    messages: apiMessages.map((message) => mapApiMessage(message)),
    documents,
    resumeContent: data.resumeContent || '',
    originalRefId: data.originalRefId || 0,
    title: data.title || conversations.find((item) => item.id === conversationId)?.title || ''
  }
}

export async function resolveConversationPreviewBlob(
  resumeContent: string,
  latestDocument?: DocumentRecord
): Promise<ConversationPreviewBlob | null> {
  if (resumeContent) {
    try {
      const blob = await renderResumePdf(resumeContent)
      return {
        blob,
        fileName: latestDocument?.original_name || 'resume.pdf'
      }
    } catch {
      if (!latestDocument) return null
      try {
        const blob = await downloadDocumentBlob(latestDocument.file_url)
        return {
          blob,
          fileName: latestDocument.original_name
        }
      } catch (error) {
        console.error('[conversation-loader] PDF fallback render failed:', error)
        return null
      }
    }
  }

  if (!latestDocument) return null

  try {
    const blob = await downloadDocumentBlob(latestDocument.file_url)
    return {
      blob,
      fileName: latestDocument.original_name
    }
  } catch {
    return null
  }
}

export async function loadConversationSnapshot(
  conversationId: string,
  conversations: Conversation[]
): Promise<ConversationSnapshot & { previewBlob: ConversationPreviewBlob | null }> {
  const result = await getConversationMessages(conversationId, 1, 100, 'DESC')
  const snapshot = buildConversationSnapshot(result, conversations, conversationId)
  const previewBlob = await resolveConversationPreviewBlob(
    snapshot.resumeContent,
    snapshot.documents[0]
  )

  return {
    ...snapshot,
    previewBlob
  }
}
