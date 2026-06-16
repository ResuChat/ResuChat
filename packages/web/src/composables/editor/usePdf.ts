import { ref, computed, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat.store'
import { downloadDocumentBlob } from '@/lib/conversation-loader'
import {
  getConversationMessages,
  getDocHistory,
  getReferenceFiles,
  restoreDocVersion,
  renderResumePdf,
  api
} from '@/api'
import type { Message } from '@/types/chat'
import { mapApiMessage } from '@/lib/editor-utils'

interface ChatPanelScrollApi {
  scrollToBottom: () => void
}

export function useEditorPdf(
  conversationId: Ref<string>,
  messages: Ref<Message[]>,
  chatPanelRef: Ref<ChatPanelScrollApi | undefined>,
  autoScroll: Ref<boolean>
) {
  const chatStore = useChatStore()
  const { referenceFiles, docVersions, activeVersionIdx, fileBlobUrl } = storeToRefs(chatStore)
  const refFilesLoading = ref(false)

  const currentVersionLabel = computed(() => {
    const v = docVersions.value[activeVersionIdx.value]
    if (!v) return ''
    return v.type === 'original' ? '原始简历' : `修改版本 v${v.version}`
  })

  async function loadReferenceFiles() {
    if (!conversationId.value) return
    refFilesLoading.value = true
    try {
      const result = await getReferenceFiles(conversationId.value)
      chatStore.referenceFiles = result.docs || []
    } catch (e) {
      console.error('Failed to load reference files:', e)
    } finally {
      refFilesLoading.value = false
    }
  }

  async function loadDocHistory() {
    if (!conversationId.value) return
    try {
      const result = await getDocHistory(conversationId.value)
      chatStore.docVersions = result.versions || []
      chatStore.activeVersionIdx = chatStore.docVersions.length - 1
    } catch (e) {
      console.error('Failed to load doc history:', e)
    }
  }

  async function switchVersion(idx: number) {
    if (idx === activeVersionIdx.value) return
    const v = docVersions.value[idx]
    if (!v) return
    let blob: Blob
    if (v.type === 'original' && chatStore.resumeContent) {
      blob = await renderResumePdf(chatStore.resumeContent)
    } else {
      blob = (await api.get(`/documents/${v.refId}/download`, { responseType: 'blob' })) as Blob
    }
    chatStore.setFileBlob(blob, chatStore.fileName || 'resume.pdf')
    activeVersionIdx.value = idx
  }

  async function handleRestore(refId: number) {
    try {
      const v = docVersions.value.find((d) => d.refId === refId)
      const ts = Date.now()
      messages.value.push({
        id: `local-restore-${ts}`,
        role: 'assistant',
        content: `已恢复到版本 v${v?.version ?? ''}`
      })
      autoScroll.value = true
      chatPanelRef.value?.scrollToBottom()
      await restoreDocVersion(refId)
      ElMessage.success('已恢复')
      await loadDocHistory()
      await reloadPdfFromServer()
    } catch (e) {
      console.error('Failed to restore version:', e)
      ElMessage.error('恢复失败')
    }
  }

  async function reloadPdfFromServer(): Promise<Message[]> {
    if (!conversationId.value) return []
    try {
      const result = await getConversationMessages(conversationId.value, 1, 1, 'DESC')
      const docs = result.data?.documents ?? []
      if (docs.length > 0) {
        const latestDoc = docs[0]
        const blob = await downloadDocumentBlob(latestDoc.file_url)
        chatStore.setFileBlob(blob, latestDoc.original_name || 'resume.pdf')
      }
      return (result.data?.messages ?? []).map(mapApiMessage)
    } catch (e) {
      console.error('Failed to reload PDF from server:', e)
      return []
    }
  }

  function downloadPdf() {
    if (!fileBlobUrl.value) {
      ElMessage.warning('PDF 尚未生成')
      return
    }
    const a = document.createElement('a')
    a.href = fileBlobUrl.value
    a.download = chatStore.fileName || 'resume.pdf'
    a.click()
  }

  function resetPdfState() {
    chatStore.referenceFiles = []
    chatStore.clearFileBlob()
    chatStore.docVersions = []
    chatStore.activeVersionIdx = 0
  }

  return {
    pdfUrl: fileBlobUrl,
    referenceFiles,
    refFilesLoading,
    docVersions,
    activeVersionIdx,
    currentVersionLabel,
    loadReferenceFiles,
    loadDocHistory,
    switchVersion,
    handleRestore,
    reloadPdfFromServer,
    downloadPdf,
    resetPdfState
  }
}
