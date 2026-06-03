import { ref, computed, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useResumeStore } from '@/stores/resume'
import {
  getConversationMessages,
  getDocHistory,
  getReferenceFiles,
  restoreDocVersion,
  renderResumePdf,
  api,
  type ReferenceDoc,
  type DocVersion
} from '@/api'
import type { Message } from '@/types/chat'
import { mapApiMessage } from '@/lib/editor-utils'

export function useEditorPdf(
  conversationId: Ref<string>,
  messages: Ref<Message[]>,
  chatPanelRef: Ref<any>,
  autoScroll: Ref<boolean>
) {
  const resumeStore = useResumeStore()
  const pdfUrl = ref<string>('')
  const docVersions = ref<DocVersion[]>([])
  const activeVersionIdx = ref(0)
  const referenceFiles = ref<ReferenceDoc[]>([])
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
      referenceFiles.value = result.docs || []
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
      docVersions.value = result.versions || []
      activeVersionIdx.value = docVersions.value.length - 1
    } catch (e) {
      console.error('Failed to load doc history:', e)
    }
  }

  async function switchVersion(idx: number) {
    if (idx === activeVersionIdx.value) return
    const v = docVersions.value[idx]
    if (!v) return
    let blob: Blob
    if (v.type === 'original' && resumeStore.resumeContent) {
      blob = await renderResumePdf(resumeStore.resumeContent)
    } else {
      blob = (await api.get(`/rag/docs/${v.refId}/download`, { responseType: 'blob' })) as Blob
    }
    const newUrl = URL.createObjectURL(blob)
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = newUrl
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
        const fileUrl = latestDoc.file_url.startsWith('/api')
          ? latestDoc.file_url
          : `/api${latestDoc.file_url}`
        const blob = (await api.get(fileUrl.replace('/api', ''), {
          responseType: 'blob'
        })) as Blob
        const newUrl = URL.createObjectURL(blob)
        if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
        pdfUrl.value = newUrl
      }
      return (result.data?.messages ?? []).map(mapApiMessage)
    } catch (e) {
      console.error('Failed to reload PDF from server:', e)
      return []
    }
  }

  function downloadPdf() {
    if (!pdfUrl.value) {
      ElMessage.warning('PDF 尚未生成')
      return
    }
    const a = document.createElement('a')
    a.href = pdfUrl.value
    a.download = 'resume.pdf'
    a.click()
  }

  function resetPdfState() {
    referenceFiles.value = []
    pdfUrl.value = ''
    docVersions.value = []
    activeVersionIdx.value = 0
  }

  return {
    pdfUrl,
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
