import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getConversations } from '@/api/conversation'
import type { Conversation, DocumentRecord, ReferenceDoc, DocVersion } from '@/types/api'
import type { Message } from '@/types/chat'
import { loadConversationSnapshot } from '@/lib/conversation-loader'

export const useChatStore = defineStore(
  'chat',
  () => {
    const initialPrompt = ref('')
    const messages = ref<Message[]>([])
    const conversationId = ref('')
    const conversations = ref<Conversation[]>([])
    const conversationTitle = ref('')
    const documents = ref<DocumentRecord[]>([])
    const referenceFiles = ref<ReferenceDoc[]>([])
    const docVersions = ref<DocVersion[]>([])
    const activeVersionIdx = ref(0)
    const conversationsLoading = ref(false)
    const resumeContent = ref('')
    const originalRefId = ref(0)
    const fileBlobUrl = ref('')
    const fileName = ref('')

    function revokeFileBlobUrl() {
      if (fileBlobUrl.value) URL.revokeObjectURL(fileBlobUrl.value)
    }

    function setFileBlob(blob: Blob, name: string) {
      revokeFileBlobUrl()
      fileBlobUrl.value = URL.createObjectURL(blob)
      fileName.value = name
    }

    function clearFileBlob() {
      revokeFileBlobUrl()
      fileBlobUrl.value = ''
      fileName.value = ''
    }

    function setPrompt(prompt: string) {
      initialPrompt.value = prompt
    }
    function setConversationId(id: string) {
      conversationId.value = id
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
      const result = await loadConversationSnapshot(id, conversations.value)
      if (seq !== _loadSeq) return { totalMessages: 0, initialPrompt: '' }
      const prompt = result.initialPrompt
      if (prompt) initialPrompt.value = prompt
      messages.value = result.messages
      documents.value = result.documents
      resumeContent.value = result.resumeContent
      originalRefId.value = result.originalRefId
      conversationTitle.value = result.title

      if (result.previewBlob) {
        setFileBlob(result.previewBlob.blob, result.previewBlob.fileName)
      } else {
        clearFileBlob()
      }

      return { totalMessages: result.totalMessages, initialPrompt: prompt }
    }

    function clearConversation() {
      conversationId.value = ''
      messages.value = []
      clearFileBlob()
      documents.value = []
      referenceFiles.value = []
      docVersions.value = []
      activeVersionIdx.value = 0
      conversationTitle.value = ''
    }

    return {
      initialPrompt,
      messages,
      conversationId,
      conversations,
      conversationTitle,
      documents,
      referenceFiles,
      docVersions,
      activeVersionIdx,
      conversationsLoading,
      resumeContent,
      originalRefId,
      fileBlobUrl,
      fileName,
      setFileBlob,
      clearFileBlob,
      setPrompt,
      setConversationId,
      fetchConversations,
      loadConversation,
      clearConversation
    }
  },
  {
    persist: {
      pick: ['conversations', 'conversationId', 'conversationTitle', 'initialPrompt', 'fileName']
    }
  }
)
