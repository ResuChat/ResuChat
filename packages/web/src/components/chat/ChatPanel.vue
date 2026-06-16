<template>
  <div class="chat-panel flex flex-col h-full">
    <!-- 标题栏 -->
    <div class="chat-panel-header flex justify-between items-center px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="font-medium">{{ chatTitle }}</span>
      </div>
    </div>

    <!-- 消息区域（column-reverse: 队列在底部，消息在上方） -->
    <div class="chat-history-shell flex flex-col-reverse flex-1 min-h-0 px-4">
      <QueueIndicator
        :queue="requestQueue"
        :pending-count="pendingCount"
        @cancel-all="$emit('cancel-all-pending')"
        @cancel="(id) => $emit('cancel-request', id)"
      />

      <div
        ref="chatRef"
        class="chat-scroll-area flex-1 overflow-y-auto min-h-0 relative"
        @scroll="handleChatScroll"
      >
        <div v-if="historyLoading" class="flex items-center justify-center gap-2 py-3 text-xs">
          <el-icon class="animate-spin">
            <Loading />
          </el-icon>
          加载更多...
        </div>
        <ChatMessage
          v-for="(msg, msgIndex) in messages"
          :key="msg.id"
          :msg="msg"
          :msg-index="msgIndex"
          :is-loading="isLoading"
          :is-last="msgIndex === messages.length - 1"
          :content="msg.content"
          @toggle-reasoning="(id) => $emit('toggle-reasoning', id)"
        >
          <template #optimizations="{ msg, msgIndex }">
            <OptimizationCard
              v-for="(opt, optIdx) in msg.optimizations"
              :key="optIdx"
              :item="opt"
              :disabled="disabledOpts.has(`${msgIndex}-${optIdx}`)"
              @apply="(item) => $emit('apply-optimization', item, optIdx, msgIndex, msg)"
            />
          </template>
          <template #modifications="{ msg, msgIndex }">
            <ModificationReview
              v-for="(mod, modIdx) in msg.modifications"
              :key="modIdx"
              :item="mod"
              :msg-index="msgIndex"
              :mod-idx="modIdx"
              :disabled="disabledMods.has(`${msgIndex}-${modIdx}`)"
              @accept="(item, mi, mdi) => $emit('accept-modification', item, mi, mdi)"
              @supplement="(item, mi, mdi) => $emit('supplement-modification', item, mi, mdi)"
              @reject="(mi, mdi) => $emit('reject-modification', mi, mdi)"
            />
          </template>
        </ChatMessage>
      </div>
    </div>

    <!-- 错误条 -->
    <div
      v-if="chatError"
      class="mx-4 mb-1 flex items-center gap-2 rounded-lg border border-(--error-bg) bg-(--error-bg) px-3 py-2"
    >
      <span class="flex-1 text-xs overflow-hidden text-ellipsis whitespace-nowrap">{{
        chatError
      }}</span>
      <el-button text size="small" @click="$emit('close-error')"> 关闭 </el-button>
      <el-button text size="small" type="primary" @click="$emit('retry-send')"> 重试 </el-button>
    </div>

    <!-- 输入区 -->
    <ChatInput
      :text="inputText"
      :is-processing="isProcessing"
      :reference-count="referenceFiles.length"
      @send="
        (t, f, d, a) => {
          inputText = ''
          $emit('send', t, f, d, a)
        }
      "
      @open-ref-drawer="showRefDrawer = true"
      @stop="$emit('stop')"
    />

    <!-- 参考资料抽屉 -->
    <ReferenceDrawer
      v-model:visible="showRefDrawer"
      :files="referenceFiles"
      @remove="(id) => $emit('remove-reference-file', id)"
    />

    <!-- 补充确认弹窗 -->
    <el-dialog
      v-model="showSupplDialog"
      title="补充修改要求"
      width="420px"
      @closed="handleSupplementClosed"
    >
      <el-input v-model="supplText" type="textarea" :rows="3" placeholder="请输入补充说明..." />
      <template #footer>
        <el-button @click="cancelSuppl"> 取消 </el-button>
        <el-button type="primary" @click="submitSuppl"> 确定 </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import type { Message, OptimizationItem, ModificationItem, MessageAttachment } from '@/types/chat'
import type { ReferenceDoc } from '@/api'
import type { QueuedRequest } from '@/types/chat'
import OptimizationCard from '@/components/suggestion/OptimizationCard.vue'
import ModificationReview from '@/components/suggestion/ModificationReview.vue'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'
import QueueIndicator from './QueueIndicator.vue'
import ReferenceDrawer from './ReferenceDrawer.vue'

defineProps<{
  messages: Message[]
  isLoading: boolean
  chatTitle: string
  chatError: string
  referenceFiles: ReferenceDoc[]
  historyLoading: boolean
  hasMoreHistory: boolean
  requestQueue: QueuedRequest[]
  isProcessing: boolean
  isSearchProcessing: boolean
  pendingCount: number
  disabledOpts: Set<string>
  disabledMods: Set<string>
}>()

const emit = defineEmits<{
  send: [text: string, files: File[], docIds: number[], attachments: MessageAttachment[]]
  'load-more-history': []
  'chat-scroll': [payload: { scrollTop: number; scrollHeight: number; clientHeight: number }]
  'retry-send': []
  'close-error': []
  'remove-reference-file': [id: number]
  'apply-optimization': [item: OptimizationItem, idx: number, msgIndex: number, msg: Message]
  'accept-modification': [item: ModificationItem, msgIndex: number, modIdx: number]
  'supplement-modification': [item: ModificationItem, msgIndex: number, modIdx: number]
  'reject-modification': [msgIndex: number, modIdx: number]
  'submit-supplement': [text: string]
  'cancel-supplement': []
  stop: []
  'cancel-request': [id: string]
  'cancel-all-pending': []
  'reorder-queue': [newQueue: QueuedRequest[]]
  'toggle-reasoning': [msgId: string]
}>()

const chatRef = ref<HTMLElement>()
const inputText = ref('')
const showRefDrawer = ref(false)
const showSupplDialog = ref(false)
const supplText = ref('')
const supplementSubmitted = ref(false)
function handleChatScroll() {
  const el = chatRef.value
  if (el)
    emit('chat-scroll', {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    })
}
function submitSuppl() {
  supplementSubmitted.value = true
  emit('submit-supplement', supplText.value)
  showSupplDialog.value = false
}
function cancelSuppl() {
  showSupplDialog.value = false
}
function handleSupplementClosed() {
  if (!supplementSubmitted.value) {
    emit('cancel-supplement')
  }
  supplementSubmitted.value = false
}
function openSupplementDialog() {
  showSupplDialog.value = true
  supplText.value = ''
  supplementSubmitted.value = false
}
let needsScroll = false

function scrollToBottom() {
  if (!needsScroll) {
    needsScroll = true
    nextTick(() => {
      if (chatRef.value) {
        chatRef.value.scrollTop = chatRef.value.scrollHeight
      }
      needsScroll = false
    })
  }
}
function getScrollHeight() {
  return chatRef.value?.scrollHeight ?? 0
}
function restoreScrollPosition(pos: number) {
  const el = chatRef.value
  if (el) el.scrollTop = pos
}
function setInput(text: string) {
  inputText.value = text
}

defineExpose({
  scrollToBottom,
  getScrollHeight,
  restoreScrollPosition,
  setInput,
  openSupplementDialog
})
</script>

<style scoped>
.chat-panel {
  --chat-panel-history-bg: color-mix(in oklab, var(--bg) 96%, oklch(98.5% 0.01 92deg) 4%);
}

.chat-panel-header {
  background: color-mix(in oklab, var(--surface-raised) 76%, transparent);
  color: var(--text);
}

.chat-scroll-area {
  margin-right: -10px;
  padding: 10px 10px 10px 0;
}

.chat-history-shell {
  background: var(--chat-panel-history-bg);
}

:global(:root.dark) .chat-panel {
  --chat-panel-history-bg: color-mix(in oklab, var(--bg-secondary) 58%, transparent);
}
</style>
