<template>
  <div v-if="loading" class="flex justify-center items-center h-screen bg-[#f5f5f5]">
    <el-skeleton :rows="8" animated style="width: 60%" />
  </div>
  <div v-else-if="error" class="flex justify-center items-center h-screen bg-[#f5f5f5]">
    <el-result icon="error" title="加载失败" :sub-title="error">
      <template #extra>
        <el-button type="primary" @click="retryLoad"> 重试 </el-button>
      </template>
    </el-result>
  </div>
  <div v-else class="editor-page">
    <div class="left-panel">
      <PdfPreview
        :pdf-url
        :loading
        :error
        :versions="docVersions"
        :active-index="activeVersionIdx"
        :current-version="currentVersionLabel"
        :show-restore="docVersions.length > 1 && activeVersionIdx !== docVersions.length - 1"
        @download="downloadPdf"
        @select-version="switchVersion"
        @restore="handleRestore"
      />
    </div>

    <div class="right-panel">
      <ChatPanel
        ref="chatPanelRef"
        :messages
        :is-loading
        :chat-title
        :chat-error
        :reference-files
        :history-loading
        :has-more-history
        :request-queue
        :is-processing
        :is-search-processing
        :pending-count="pendingQueueCount"
        :disabled-opts
        :disabled-mods
        @send="onChatSend"
        @load-more-history="loadMoreHistory"
        @chat-scroll="onChatScroll"
        @retry-send="retrySend"
        @close-error="chatError = ''"
        @remove-reference-file="removeReferenceFile"
        @apply-optimization="handleApplyOptimization"
        @accept-modification="handleAcceptModification"
        @supplement-modification="handleSupplementModification"
        @reject-modification="handleRejectModification"
        @submit-supplement="handleSubmitSupplement"
        @stop="handleStop"
        @toggle-drawer="drawerVisible = true"
        @go-back="goBack"
        @cancel-request="handleCancelRequest"
        @cancel-all-pending="handleCancelAllPending"
        @reorder-queue="onReorderQueue"
        @toggle-reasoning="onToggleReasoning"
      />
    </div>

    <ConversationDrawer v-model:visible="drawerVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { generateId } from 'ai'
import { ElMessage } from 'element-plus'
import { useResumeStore } from '@/stores/resume'
import { deleteReferenceFile } from '@/api'
import { useRequestQueue } from '@/composables/useRequestQueue'
import { useEditorPdf } from '@/composables/useEditorPdf'
import { useEditorHistory } from '@/composables/useEditorHistory'
import { useEditorChat } from '@/composables/useEditorChat'
import { useEditorModifications } from '@/composables/useEditorModifications'
import ConversationDrawer from '@/components/ConversationDrawer.vue'
import PdfPreview from '@/components/PdfPreview.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import type { Message } from '@/types/chat'

const router = useRouter()
const route = useRoute()
const resumeStore = useResumeStore()
const chatPanelRef = ref<InstanceType<typeof ChatPanel>>()
const loading = ref(true)
const error = ref('')
const drawerVisible = ref(false)
const conversationId = ref('')
const messages = ref<Message[]>([])
const isLoading = ref(false)
const chatError = ref('')
const failedMessage = ref('')
const historyLoading = ref(false)
const autoScroll = ref(true)

const loadReferenceFilesRef = { value: () => {} }
const {
  requestQueue,
  isProcessing,
  isSearchProcessing,
  pendingQueueCount,
  enqueueRequest,
  cancelRequest,
  cancelAllPending,
  dequeue,
  onReorderQueue
} = useRequestQueue({ loadReferenceFilesRef })

const {
  pdfUrl,
  referenceFiles,
  docVersions,
  activeVersionIdx,
  currentVersionLabel,
  loadReferenceFiles,
  loadDocHistory,
  switchVersion,
  handleRestore,
  reloadPdfFromServer,
  downloadPdf
} = useEditorPdf(conversationId, messages, chatPanelRef, autoScroll)
loadReferenceFilesRef.value = loadReferenceFiles

const { hasMoreHistory, loadMoreHistory, resetHistory } = useEditorHistory(
  messages,
  conversationId,
  chatPanelRef,
  historyLoading
)

const { chat, transport, initChat, showReasoningMap } = useEditorChat({
  conversationId,
  requestQueue,
  dequeue,
  reloadPdfFromServer,
  loadDocHistory,
  messages,
  isLoading,
  chatError,
  failedMessage,
  autoScroll,
  chatPanelRef
})

const {
  disabledOpts,
  disabledMods,
  supplementCount,
  onApplyOptimization,
  acceptModification,
  supplementModification,
  submitSupplement,
  rejectModification,
  cleanupDisabledKeys,
  resetSupplement
} = useEditorModifications(messages)

function handleApplyOptimization(item: any, idx: number, msgIndex: number, msg: Message) {
  onApplyOptimization(item, idx, msgIndex, msg, {
    chat,
    conversationId: conversationId.value,
    enqueueRequest,
    isLoading,
    dequeue,
    autoScroll,
    chatPanelRef
  })
}
function handleAcceptModification(item: any, msgIndex: number, modIdx: number) {
  acceptModification(item, msgIndex, modIdx, {
    chat,
    conversationId: conversationId.value,
    enqueueRequest,
    isLoading,
    dequeue
  })
}
function handleSupplementModification(item: any, msgIndex: number, modIdx: number) {
  supplementModification(item, msgIndex, modIdx, chatPanelRef)
}
function handleRejectModification(msgIndex: number, modIdx: number) {
  rejectModification(msgIndex, modIdx)
}
function handleSubmitSupplement(text: string) {
  submitSupplement(text, {
    chat,
    conversationId: conversationId.value,
    enqueueRequest,
    isLoading,
    chatPanelRef
  })
}

const chatTitle = computed(() => {
  return resumeStore.conversationTitle || '简历优化助手'
})

function retryLoad() {
  error.value = ''
  loading.value = true
  window.location.reload()
}

function handleStop() {
  transport.stop()
  requestQueue.value = []
  isProcessing.value = false
  isSearchProcessing.value = false
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant' && last.status !== 'interrupted') {
    last.status = 'interrupted'
  }
}

function handleCancelRequest(id: string) {
  const { disabledKey, wasSupplement } = cancelRequest(id)
  if (disabledKey) cleanupDisabledKeys([disabledKey])
  if (wasSupplement) supplementCount.value = Math.max(0, supplementCount.value - 1)
}

function handleCancelAllPending() {
  const { keys, drops } = cancelAllPending()
  if (keys.length > 0) cleanupDisabledKeys(keys)
  if (drops > 0) supplementCount.value = Math.max(0, supplementCount.value - drops)
}

function onChatScroll(payload: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  const isNearBottom = payload.scrollHeight - payload.scrollTop - payload.clientHeight < 80
  autoScroll.value = isNearBottom
  if (!isNearBottom && hasMoreHistory.value && payload.scrollTop < 30) {
    loadMoreHistory()
  }
}

function onChatSend(text: string, files: File[]) {
  if (!text.trim() && files.length === 0) return
  failedMessage.value = text
  autoScroll.value = true
  isLoading.value = true

  if (files.length > 0) {
    const optimisticDocs = files.map((f) => ({
      id: 0,
      original_name: f.name,
      file_type: f.name.split('.').pop()?.toLowerCase() || '',
      file_size: f.size,
      file_path: '',
      doc_type: 'reference' as const,
      version: 0,
      created_at: Date.now(),
      ref_category: undefined
    }))
    referenceFiles.value = [...optimisticDocs, ...referenceFiles.value]
  }

  const userMsgId = generateId()
  const assistantMsgId = generateId()
  enqueueRequest(
    {
      type: 'search',
      execute: () => {
        isLoading.value = true
        supplementCount.value = 0
        messages.value.push({ id: userMsgId, role: 'user', content: text })
        chat.messages.push({ id: userMsgId, role: 'user', parts: [{ type: 'text', text }] })
        chat.sendMessage(
          { messageId: userMsgId, parts: [{ type: 'text', text }] },
          {
            body: {
              type: 'search',
              conversationId: conversationId.value,
              query: text,
              userMsgId,
              assistantMsgId,
              files: files.length > 0 ? files : undefined
            }
          }
        )
      }
    },
    { text }
  )

  chatPanelRef.value?.scrollToBottom()
}

async function removeReferenceFile(refId: number) {
  if (!conversationId.value) return
  try {
    await deleteReferenceFile(conversationId.value, refId)
    referenceFiles.value = referenceFiles.value.filter((d) => d.id !== refId)
    ElMessage.success('参考资料已删除')
  } catch {
    ElMessage.error('删除失败')
  }
}

function retrySend() {
  chatError.value = ''
  const text = failedMessage.value
  failedMessage.value = ''
  if (text) {
    onChatSend(text, [])
  }
}

function goBack() {
  router.push('/conversations')
}

function loadConversationToState(id: string, totalMsgs: number, resetPdf = true) {
  resetSupplement()
  conversationId.value = id
  resetHistory(totalMsgs)
  if (resetPdf) {
    pdfUrl.value = resumeStore.fileBlobUrl
  } else if (resumeStore.fileBlobUrl) {
    pdfUrl.value = resumeStore.fileBlobUrl
  }
  loadReferenceFiles()
  loadDocHistory()
}

function autoTriggerSearch(query: string, id: string) {
  isLoading.value = true
  const userMsgId = generateId()
  const assistantMsgId = generateId()
  enqueueRequest(
    {
      type: 'search',
      execute: () => {
        chat.messages.push({ id: userMsgId, role: 'user', parts: [{ type: 'text', text: query }] })
        chat.sendMessage(
          { messageId: userMsgId, parts: [{ type: 'text', text: query }] },
          { body: { conversationId: id, query, userMsgId, assistantMsgId } }
        )
      }
    },
    { text: query }
  )
}

function triggerSearchIfNeeded() {
  const msgs = resumeStore.messages
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    const sdkMsgs = chat.messages ?? []
    const hasAssistantReply = sdkMsgs.some((m: any) => m.role === 'assistant')
    if (hasAssistantReply) return
    autoTriggerSearch(msgs[msgs.length - 1].content, conversationId.value)
  }
}

function onToggleReasoning(msgId: string) {
  const current = showReasoningMap.get(msgId) ?? false
  showReasoningMap.set(msgId, !current)
  const msg = messages.value.find((m) => m.id === msgId)
  if (msg) msg.showReasoning = !current
}

onUnmounted(() => {
  if (pdfUrl.value && pdfUrl.value !== resumeStore.fileBlobUrl) {
    URL.revokeObjectURL(pdfUrl.value)
  }
  pdfUrl.value = ''
})

onMounted(async () => {
  const routeId = route.params.id as string
  if (!routeId) {
    router.push('/conversations')
    return
  }

  try {
    const { totalMessages, initialPrompt: loadedInitialPrompt } =
      await resumeStore.loadConversation(routeId)
    conversationId.value = routeId
    loadConversationToState(routeId, totalMessages)

    const historyMessages = resumeStore.messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text', text: m.content }]
    }))
    initChat(historyMessages)
    messages.value = resumeStore.messages

    if (resumeStore.fileBlobUrl) {
      pdfUrl.value = resumeStore.fileBlobUrl
    }

    if (resumeStore.messages.length === 0 && loadedInitialPrompt) {
      autoTriggerSearch(loadedInitialPrompt, routeId)
    } else {
      triggerSearchIfNeeded()
    }

    loading.value = false

    await nextTick()
    chatPanelRef.value?.scrollToBottom()
  } catch (e) {
    console.error('Failed to load conversation:', e)
    error.value = '加载会话失败'
    loading.value = false
  }
})

watch(
  () => route.params.id,
  async (newId) => {
    if (newId && newId !== conversationId.value) {
      loading.value = true
      messages.value = []
      showReasoningMap.clear()
      try {
        const { totalMessages, initialPrompt: newInitialPrompt } =
          await resumeStore.loadConversation(newId as string)
        conversationId.value = newId as string
        loadConversationToState(newId as string, totalMessages, false)

        const historyMessages = resumeStore.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: [{ type: 'text', text: m.content }]
        }))
        initChat(historyMessages)
        messages.value = resumeStore.messages

        if (resumeStore.fileBlobUrl) {
          pdfUrl.value = resumeStore.fileBlobUrl
        }

        if (resumeStore.messages.length === 0 && newInitialPrompt) {
          autoTriggerSearch(newInitialPrompt, newId as string)
        } else {
          triggerSearchIfNeeded()
        }

        loading.value = false

        await nextTick()
        chatPanelRef.value?.scrollToBottom()
      } catch {
        error.value = '切换会话失败'
        loading.value = false
      }
    }
  }
)
</script>

<style scoped>
.editor-page {
  display: flex;
  height: calc(100vh - 50px);
}

.left-panel {
  flex: 1;
  padding: 20px;
  background: #f5f5f5;
  overflow: hidden;
}

.right-panel {
  width: 400px;
  padding: 20px;
  background: white;
}
</style>
