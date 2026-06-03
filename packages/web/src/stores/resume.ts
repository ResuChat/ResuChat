import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getConversations,
  getConversationMessages,
  getUserProfile,
  renderResumePdf,
  api,
  type Conversation,
  type DocumentRecord,
  type UserProfile
} from '@/api'

import type { Message } from '@/types/chat'
import { mapApiMessage } from '@/lib/editor-utils'

export const useResumeStore = defineStore('resume', () => {
  const fileName = ref('')
  const fileBlobUrl = ref('')
  const initialPrompt = ref('')
  const messages = ref<Message[]>([])
  const conversationId = ref('')
  const userInfo = ref<UserProfile | null>(null)
  const conversations = ref<Conversation[]>([])
  const conversationTitle = ref('')
  const documents = ref<DocumentRecord[]>([])
  const conversationsLoading = ref(false)
  const userLoading = ref(false)
  const resumeContent = ref('')
  const originalRefId = ref(0)

  function setFile(name: string, _type: string, _content: string, blobUrl: string = '') {
    fileName.value = name
    fileBlobUrl.value = blobUrl
  }

  function setPrompt(prompt: string) {
    initialPrompt.value = prompt
  }

  function setConversationId(id: string) {
    conversationId.value = id
  }

  async function fetchUserProfile(force = false) {
    if (userInfo.value && !force) return userInfo.value
    userLoading.value = true
    try {
      const data = await getUserProfile()
      userInfo.value = data
      return data
    } finally {
      userLoading.value = false
    }
  }

  async function fetchConversations(page = 1, pageSize = 20) {
    conversationsLoading.value = true
    try {
      const result = await getConversations(page, pageSize)
      conversations.value = result.data
      return result
    } finally {
      conversationsLoading.value = false
    }
  }

  let _loadSeq = 0

  async function loadConversation(id: string) {
    const seq = ++_loadSeq
    conversationId.value = id
    const result = await getConversationMessages(id, 1, 200, 'DESC')
    if (seq !== _loadSeq) return { totalMessages: 0, initialPrompt: '' }
    const data = result.data ?? result
    const apiMessages = (data.messages ?? []).reverse()
    const apiDocs = data.documents ?? []
    const totalMessages = result.pagination?.total ?? apiMessages.length
    const initialPrompt = data.initialPrompt || ''

    messages.value = apiMessages.map((m: any) => mapApiMessage(m))

    documents.value = apiDocs
    resumeContent.value = data.resumeContent || ''
    originalRefId.value = data.originalRefId || 0
    conversationTitle.value =
      data.title || conversations.value.find((c) => c.id === id)?.title || ''

    // 优先用 Markdown 渲染 PDF（解析后的结构化内容），回退到原始文档
    const md = data.resumeContent || ''
    const latestDoc = apiDocs[0]
    if (md) {
      try {
        const blob = await renderResumePdf(md)
        if (fileBlobUrl.value) URL.revokeObjectURL(fileBlobUrl.value)
        fileBlobUrl.value = URL.createObjectURL(blob)
        fileName.value = latestDoc?.original_name || 'resume.pdf'
      } catch (e) {
        console.error('Failed to render resume PDF from markdown, falling back to original:', e)
        if (latestDoc) {
          try {
            const fileUrl = latestDoc.file_url.startsWith('/api')
              ? latestDoc.file_url
              : `/api${latestDoc.file_url}`
            const fallbackBlob = (await api.get(fileUrl.replace('/api', ''), {
              responseType: 'blob'
            })) as Blob
            if (fileBlobUrl.value) URL.revokeObjectURL(fileBlobUrl.value)
            fileBlobUrl.value = URL.createObjectURL(fallbackBlob)
            fileName.value = latestDoc.original_name
          } catch (e2) {
            console.error('Failed to load original PDF:', e2)
          }
        }
      }
    } else if (latestDoc) {
      try {
        const fileUrl = latestDoc.file_url.startsWith('/api')
          ? latestDoc.file_url
          : `/api${latestDoc.file_url}`
        const blob = (await api.get(fileUrl.replace('/api', ''), {
          responseType: 'blob'
        })) as Blob
        if (fileBlobUrl.value) URL.revokeObjectURL(fileBlobUrl.value)
        fileBlobUrl.value = URL.createObjectURL(blob)
        fileName.value = latestDoc.original_name
      } catch (e) {
        console.error('Failed to load PDF:', e)
      }
    }

    return { totalMessages, initialPrompt }
  }

  function clearConversation() {
    conversationId.value = ''
    messages.value = []
    if (fileBlobUrl.value) URL.revokeObjectURL(fileBlobUrl.value)
    fileBlobUrl.value = ''
    fileName.value = ''
    documents.value = []
    conversationTitle.value = ''
  }

  return {
    fileName,
    fileBlobUrl,
    initialPrompt,
    messages,
    conversationId,
    conversationTitle,
    userInfo,
    conversations,
    documents,
    resumeContent,
    originalRefId,
    conversationsLoading,
    userLoading,
    setFile,
    setPrompt,
    setConversationId,
    fetchUserProfile,
    fetchConversations,
    loadConversation,
    clearConversation
  }
})
