<template>
  <EditorSkeleton v-if="loading" />
  <div v-else-if="error" class="flex justify-center items-center h-screen">
    <el-result icon="error" title="加载失败" :sub-title="error">
      <template #extra>
        <el-button type="primary" @click="retryLoad"> 重试 </el-button>
      </template>
    </el-result>
  </div>
  <div v-else class="editor-page">
    <div class="left-panel">
      <PdfViewer
        :pdf-url
        :versions="docVersions"
        :active-index="activeVersionIdx"
        :current-version="currentVersionLabel"
        :show-restore="docVersions.length > 1 && activeVersionIdx !== docVersions.length - 1"
        @download="downloadPdf"
        @select-version="switchVersion"
        @restore="handleRestore"
        @save-to-library="handleSaveToLibrary"
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
        @cancel-supplement="handleCancelSupplement"
        @stop="handleStop"
        @cancel-request="handleCancelRequest"
        @cancel-all-pending="handleCancelAllPending"
        @reorder-queue="onReorderQueue"
        @toggle-reasoning="onToggleReasoning"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { generateId } from 'ai'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { api, deleteReferenceFile } from '@/api'
import { useChatStore } from '@/stores/chat.store'
import { useRequestQueue } from '@/composables/chat/useQueue'
import { useEditorPdf } from '@/composables/editor/usePdf'
import { useEditorHistory } from '@/composables/editor/useHistory'
import { useEditorChat } from '@/composables/chat/useChat'
import { useEditorModifications } from '@/composables/editor/useModifications'
import { resolveSearchQuery, shouldLoadMoreHistory } from '@/lib/chat-page-helpers'
import PdfViewer from '@/components/editor/PdfViewer.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import EditorSkeleton from '@/components/editor/EditorSkeleton.vue'
import type { Message, MessageAttachment, ModificationItem, OptimizationItem } from '@/types/chat'
const route = useRoute()
const chatStore = useChatStore()
const { messages } = storeToRefs(chatStore)
const chatPanelRef = ref<InstanceType<typeof ChatPanel>>()
const loading = ref(true)
const error = ref('')
const conversationId = ref('')
const isLoading = ref(false)
const chatError = ref('')
const failedMessage = ref('')
const historyLoading = ref(false)
const autoScroll = ref(true)
const scrollReady = ref(false)

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
} = useRequestQueue({ loadReferenceFiles })

const { hasMoreHistory, loadMoreHistory, resetHistory, allowAutoLoad } = useEditorHistory(
  messages,
  conversationId,
  chatPanelRef,
  historyLoading
)

const editorChat = useEditorChat({
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
const { initChat, showReasoningMap } = editorChat

const {
  disabledOpts,
  disabledMods,
  supplementCount,
  onApplyOptimization,
  acceptModification,
  supplementModification,
  submitSupplement,
  cancelSupplement,
  rejectModification,
  cleanupDisabledKeys,
  resetSupplement
} = useEditorModifications(messages)

const chatTitle = computed(() => {
  return chatStore.conversationTitle || chatStore.initialPrompt || '未命名对话'
})

function retryLoad() {
  error.value = ''
  loading.value = true
  window.location.reload()
}

function handleApplyOptimization(
  item: OptimizationItem,
  idx: number,
  msgIndex: number,
  msg: Message
) {
  const chat = editorChat.chat.value
  if (!chat) return
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

function handleAcceptModification(item: ModificationItem, msgIndex: number, modIdx: number) {
  const chat = editorChat.chat.value
  if (!chat) return
  acceptModification(item, msgIndex, modIdx, {
    chat,
    conversationId: conversationId.value,
    enqueueRequest,
    isLoading,
    dequeue
  })
}

function handleSupplementModification(item: ModificationItem, msgIndex: number, modIdx: number) {
  supplementModification(item, msgIndex, modIdx, chatPanelRef)
}

function handleRejectModification(msgIndex: number, modIdx: number) {
  rejectModification(msgIndex, modIdx)
}

function handleSubmitSupplement(text: string) {
  const chat = editorChat.chat.value
  if (!chat) {
    cancelSupplement()
    return
  }
  submitSupplement(text, {
    chat,
    conversationId: conversationId.value,
    enqueueRequest,
    isLoading,
    chatPanelRef
  })
}

function handleCancelSupplement() {
  cancelSupplement()
}

function handleStop() {
  editorChat.transport.stop()
  requestQueue.value = []
  isProcessing.value = false
  isSearchProcessing.value = false
  void loadReferenceFiles()
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
  if (payload.scrollTop > 200) {
    allowAutoLoad()
  }
  if (
    shouldLoadMoreHistory(payload, {
      scrollReady: scrollReady.value,
      hasMoreHistory: hasMoreHistory.value
    })
  ) {
    loadMoreHistory()
  }
}

function onChatSend(
  text: string,
  files: File[],
  docIds: number[] = [],
  attachments: MessageAttachment[] = []
) {
  const query = resolveSearchQuery(text, {
    hasFiles: files.length > 0,
    hasDocs: docIds.length > 0
  })
  if (!query) return

  const chat = editorChat.chat.value
  if (!chat) return

  failedMessage.value = query
  autoScroll.value = true
  isLoading.value = true

  const userMsgId = generateId()
  const assistantMsgId = generateId()

  enqueueRequest(
    {
      type: 'search',
      execute: () => {
        isLoading.value = true
        supplementCount.value = 0
        messages.value.push({
          id: userMsgId,
          role: 'user',
          content: query,
          attachments: attachments.length > 0 ? attachments : undefined
        })
        chat.messages.push({
          id: userMsgId,
          role: 'user',
          parts: [{ type: 'text', text: query }]
        })
        chat.sendMessage(
          { messageId: userMsgId, parts: [{ type: 'text', text: query }] },
          {
            body: {
              type: 'search',
              conversationId: conversationId.value,
              query,
              userMsgId,
              assistantMsgId,
              files: files.length > 0 ? files : undefined,
              docIds: docIds.length > 0 ? docIds : undefined
            }
          }
        )
      }
    },
    { text: query }
  )

  chatPanelRef.value?.scrollToBottom()
}

async function handleSaveToLibrary(refId: number) {
  try {
    await api.post('/user-documents/import', { refId })
    ElMessage.success('已保存到文档库')
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && typeof error.response?.data?.error === 'string') {
      ElMessage.warning(error.response.data.error)
      return
    }
    ElMessage.warning('保存失败')
  }
}

async function removeReferenceFile(refId: number) {
  if (!conversationId.value) return
  try {
    await deleteReferenceFile(conversationId.value, refId)
    referenceFiles.value = referenceFiles.value.filter((doc) => doc.id !== refId)
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

function onToggleReasoning(msgId: string) {
  const current = showReasoningMap.get(msgId) ?? false
  showReasoningMap.set(msgId, !current)
  const msg = messages.value.find((item) => item.id === msgId)
  if (msg) msg.showReasoning = !current
}

function loadConversationToState(id: string, totalMessages: number) {
  resetSupplement()
  conversationId.value = id
  resetHistory(totalMessages)
  loadReferenceFiles()
  loadDocHistory()
}

function autoTriggerSearch(query: string, id: string) {
  isLoading.value = true
  const userMsgId = generateId()
  const assistantMsgId = generateId()

  function doSend() {
    const chat = editorChat.chat.value
    if (!chat?.messages) {
      setTimeout(doSend, 10)
      return
    }
    chat.messages.push({ id: userMsgId, role: 'user', parts: [{ type: 'text', text: query }] })
    chat.sendMessage(
      { messageId: userMsgId, parts: [{ type: 'text', text: query }] },
      { body: { conversationId: id, query, userMsgId, assistantMsgId } }
    )
  }

  enqueueRequest({ type: 'search', execute: doSend }, { text: query })
}

function triggerSearchIfNeeded() {
  const chat = editorChat.chat.value
  if (!chat) return

  if (
    chatStore.messages.length > 0 &&
    chatStore.messages[chatStore.messages.length - 1].role === 'user'
  ) {
    const sdkMessages = chat.messages ?? []
    const hasAssistantReply = sdkMessages.some((message) => message.role === 'assistant')
    if (!hasAssistantReply) {
      autoTriggerSearch(
        chatStore.messages[chatStore.messages.length - 1].content,
        conversationId.value
      )
    }
  }
}

async function setupConversation(
  id: string,
  options?: { resetMessages?: boolean; errorMsg?: string }
) {
  const { resetMessages = false, errorMsg } = options || {}
  const minLoad = new Promise((resolve) => setTimeout(resolve, resetMessages ? 200 : 300))

  try {
    const [{ totalMessages, initialPrompt: loadedPrompt }] = await Promise.all([
      chatStore.loadConversation(id),
      minLoad
    ])
    if (resetMessages && id !== route.params.id) return

    loadConversationToState(id, totalMessages)

    const historyMessages = chatStore.messages.map((message) => ({
      id: message.id,
      role: message.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: message.content }]
    }))
    initChat(historyMessages)

    const initialPrompt = loadedPrompt || chatStore.initialPrompt
    if (chatStore.messages.length === 0 && initialPrompt) {
      autoTriggerSearch(initialPrompt, id)
    } else {
      triggerSearchIfNeeded()
    }

    loading.value = false
    await nextTick()
    chatPanelRef.value?.scrollToBottom()
    setTimeout(() => {
      scrollReady.value = true
    }, 300)
  } catch (loadError) {
    console.error('Failed to load conversation:', loadError)
    if (errorMsg) error.value = errorMsg
    loading.value = false
  }
}

onMounted(() => {
  setupConversation(String(route.params.id || ''), { errorMsg: '加载会话失败' })
})

watch(
  () => route.params.id,
  (newId) => {
    const nextId = String(newId || '')
    if (nextId && nextId !== conversationId.value) {
      loading.value = true
      messages.value = []
      showReasoningMap.clear()
      setupConversation(nextId, {
        resetMessages: true,
        errorMsg: '切换会话失败'
      })
    }
  }
)

onUnmounted(() => {
  chatStore.clearFileBlob()
})
</script>

<style scoped>
.editor-page {
  display: flex;
  height: 100vh;
}

.left-panel {
  flex: 1;
  padding: 8px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.right-panel {
  width: 400px;
  background: var(--bg);
}
</style>
