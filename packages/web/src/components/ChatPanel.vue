<template>
  <el-card class="chat-card">
    <template #header>
      <div class="chat-header">
        <div class="chat-title-wrap">
          <el-button size="small" @click="$emit('toggle-drawer')">
            <el-icon><Menu /></el-icon>
          </el-button>
          <span class="chat-title">{{ chatTitle }}</span>
        </div>
        <el-button size="small" @click="$emit('go-back')"> 返回 </el-button>
      </div>
    </template>

    <div class="chat-messages-area">
      <!-- 队列指示器（DOM 在前，column-reverse 渲染在底部） -->
      <div v-if="requestQueue.length > 1" class="queue-indicator">
        <div v-if="showQueuePanel" class="queue-panel">
          <div class="queue-panel-header">
            <span>消息队列</span>
            <el-button
              v-if="pendingCount > 0"
              size="small"
              text
              @click="$emit('cancel-all-pending')"
            >
              全部取消
            </el-button>
          </div>
          <div
            v-for="(req, idx) in requestQueue"
            :key="req.id"
            class="queue-item"
            :class="{
              canceled: req.canceled,
              'drag-over': dragOverIndex === idx,
              dragging: dragIndex === idx
            }"
            :draggable="req.status === 'pending'"
            @dragstart="onDragStart(idx, $event)"
            @dragover="onDragOver(idx, $event)"
            @drop="onDrop(idx)"
            @dragend="onDragEnd"
          >
            <span v-if="req.status === 'pending'" class="drag-handle">⠿</span>
            <span class="queue-status">{{ req.status === 'processing' ? '🔄' : '⏳' }}</span>
            <span class="queue-label">{{ req.label }}</span>
            <button
              v-if="req.status === 'pending'"
              class="queue-cancel-btn"
              @click="$emit('cancel-request', req.id)"
            >
              ✕
            </button>
          </div>
        </div>
        <button
          class="queue-toggle"
          aria-label="切换队列面板"
          @click="showQueuePanel = !showQueuePanel"
        >
          <span class="queue-toggle-text">📋 待处理 ({{ pendingCount }})</span>
          <span>{{ showQueuePanel ? '▼' : '▶' }}</span>
        </button>
      </div>

      <!-- 消息列表（DOM 在后，column-reverse 渲染在队列上方） -->
      <div ref="chatRef" class="chat-messages" @scroll="handleChatScroll">
        <div v-if="historyLoading" class="history-loading">
          <el-icon class="is-loading">
            <Loading />
          </el-icon>
          <span>加载历史消息...</span>
        </div>
        <div
          v-for="(msg, msgIndex) in messages"
          :key="msg.id ?? msgIndex"
          class="message-item"
          :class="msg.role"
        >
          <div class="message-bubble">
            <template v-if="msg.role === 'assistant'">
              <span
                v-if="msg.content"
                class="msg-text"
                :class="msg.status === 'streaming' ? 'processing-cursor' : ''"
                v-html="parseMarkdown(msg.content)"
              />
              <span
                v-if="msg.status === 'interrupted' || (!msg.content && !isLoading)"
                class="interrupted-text"
                >被中断</span
              >
              <div
                v-if="!msg.content && isLoading && msg.status !== 'interrupted'"
                class="loading-spinner"
              >
                <el-icon class="is-loading">
                  <Loading />
                </el-icon>
                <span>正在思考...</span>
              </div>
            </template>
            <span v-else class="msg-text">{{ msg.content }}</span>
          </div>

          <div v-if="msg.reasoning" class="reasoning-toggle">
            <button
              class="reasoning-btn"
              :class="{ open: msg.showReasoning }"
              aria-label="查看思考过程"
              @click="$emit('toggle-reasoning', msg.id)"
            >
              <span class="reasoning-icon">{{ msg.showReasoning ? '▼' : '▶' }}</span>
              <span class="reasoning-label">{{
                msg.showReasoning ? '收起思考过程' : '查看思考过程'
              }}</span>
            </button>
          </div>

          <div
            v-if="msg.showReasoning && msg.reasoning"
            :ref="
              (el) => {
                if (el) reasoningBoxRefs.set(String(msg.id), el as HTMLElement)
              }
            "
            class="reasoning-box"
            @scroll="(e) => onReasoningScroll(String(msg.id), e)"
          >
            <span class="msg-text">{{ msg.reasoning }}</span>
          </div>

          <div
            v-if="msg.optimizations?.length || msg.modifications?.length"
            class="inline-optimizations"
          >
            <template v-if="msg.optimizations?.length">
              <div class="ref-docs-header">优化建议</div>
              <OptimizationCard
                v-for="(item, idx) in msg.optimizations"
                :key="idx"
                :item="item"
                :disabled="disabledOpts?.has(msgIndex + '-' + idx)"
                @apply="(item) => $emit('apply-optimization', item, idx, msgIndex, msg)"
              />
            </template>
            <template v-if="msg.modifications?.length">
              <div class="ref-docs-header">修改建议</div>
              <ModificationReview
                v-for="(mod, modIdx) in msg.modifications"
                :key="'mod-' + modIdx"
                :item="mod"
                :msg-index="msgIndex"
                :mod-idx="modIdx"
                :disabled="disabledMods?.has(msgIndex + '-' + modIdx)"
                @accept="(item, mIdx, mModIdx) => $emit('accept-modification', item, mIdx, mModIdx)"
                @supplement="
                  (item, mIdx, mModIdx) => $emit('supplement-modification', item, mIdx, mModIdx)
                "
                @reject="(msgIdx, mIdx) => $emit('reject-modification', msgIdx, mIdx)"
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="chatError" class="chat-error">
      <span class="chat-error-text">发送失败: {{ chatError }}</span>
      <el-button size="small" type="danger" @click="$emit('retry-send')"> 重试 </el-button>
      <el-button size="small" @click="$emit('close-error')"> 关闭 </el-button>
    </div>

    <div class="chat-input">
      <div v-if="selectedFiles.length > 0" class="selected-files">
        <div v-for="(file, idx) in selectedFiles" :key="idx" class="selected-file-item">
          <span class="selected-file-name">{{ file.name }}</span>
          <button class="remove-file-btn" @click="removeSelectedFile(idx)">×</button>
        </div>
      </div>
      <div class="input-wrapper">
        <input
          ref="fileInputRef"
          type="file"
          accept=".pdf,.docx,.txt"
          multiple
          style="display: none"
          aria-label="上传文件"
          @change="handleFileSelect"
        />
        <textarea
          ref="inputRef"
          v-model="input"
          placeholder="请输入修改要求... (Enter 发送, Shift+Enter 换行)"
          @keydown.enter.exact.prevent="sendMsg"
          @input="autoResizeInput"
        />
      </div>
      <div class="input-actions">
        <div class="flex items-center gap-2">
          <button class="attach-btn" @click="fileInputRef?.click()" title="上传参考资料">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              />
            </svg>
          </button>
          <button class="ref-drawer-btn" @click="showRefDrawer = true" title="参考资料">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span class="ref-btn-text">参考资料</span>
          </button>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            v-if="isSearchProcessing"
            class="send-btn stop-btn"
            title="停止生成并清空队列"
            @click="$emit('stop')"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
          <button
            class="send-btn"
            :disabled="!input.trim() && selectedFiles.length === 0"
            @click="sendMsg"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </el-card>

  <el-drawer v-model="showRefDrawer" title="参考资料" size="300px">
    <div v-if="referenceFiles.length === 0" class="drawer-empty">暂无参考资料</div>
    <div v-for="doc in referenceFiles" :key="doc.id" class="drawer-file-item">
      <div class="drawer-file-info">
        <span class="drawer-file-name">{{ doc.original_name }}</span>
        <el-tag v-if="doc.ref_category" :type="refCategoryType(doc.ref_category)" size="small">
          {{ refCategoryLabel(doc.ref_category) }}
        </el-tag>
      </div>
      <el-button type="danger" size="small" text @click="$emit('remove-reference-file', doc.id)">
        删除
      </el-button>
    </div>
  </el-drawer>

  <el-dialog v-model="showSupplementInput" title="补充修改要求" width="500px">
    <el-input
      v-model="supplementInput"
      type="textarea"
      :rows="3"
      placeholder="请输入补充的修改要求..."
    />
    <template #footer>
      <el-button @click="showSupplementInput = false"> 取消 </el-button>
      <el-button type="primary" @click="submitSupplement"> 提交 </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick } from 'vue'
import { Menu, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'

function parseMarkdown(text: string): string {
  try {
    return (marked.parse(text, { async: false }) as string) || text
  } catch {
    return text
  }
}
import OptimizationCard from './OptimizationCard.vue'
import ModificationReview from './ModificationReview.vue'
import type { OptimizationItem, ModificationItem, Message } from '@/types/chat'
import type { ReferenceDoc } from '@/api'

interface QueueItem {
  id: string
  type: string
  label: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  canceled: boolean
}

function refCategoryType(category: string): 'success' | 'warning' | 'primary' | 'info' {
  return category === 'excellent_resume'
    ? 'success'
    : category === 'recruitment_guideline'
      ? 'warning'
      : category === 'job_description'
        ? 'primary'
        : 'info'
}

function refCategoryLabel(category: string): string {
  return category === 'excellent_resume'
    ? '优秀简历'
    : category === 'recruitment_guideline'
      ? '招聘准则'
      : category === 'job_description'
        ? '职位简介'
        : category
}

const props = defineProps<{
  messages: Message[]
  isLoading: boolean
  chatTitle: string
  chatError: string
  referenceFiles: ReferenceDoc[]
  historyLoading: boolean
  hasMoreHistory: boolean
  requestQueue: QueueItem[]
  isProcessing: boolean
  isSearchProcessing: boolean
  pendingCount: number
  disabledOpts?: Set<string>
  disabledMods?: Set<string>
}>()

const emit = defineEmits<{
  send: [text: string, files: File[]]
  'load-more-history': []
  'chat-scroll': [{ scrollTop: number; scrollHeight: number; clientHeight: number }]
  'retry-send': []
  'close-error': []
  'remove-reference-file': [id: number]
  'apply-optimization': [item: OptimizationItem, idx: number, msgIndex: number, msg: Message]
  'accept-modification': [item: ModificationItem, msgIndex: number, modIdx: number]
  'supplement-modification': [item: ModificationItem, msgIndex: number, modIdx: number]
  'reject-modification': [msgIndex: number, modIdx: number]
  'submit-supplement': [text: string]
  'toggle-drawer': []
  'go-back': []
  'cancel-request': [id: string]
  'cancel-all-pending': []
  'reorder-queue': [newQueue: any[]]
  'toggle-reasoning': [msgId: string]
  stop: []
}>()

const chatRef = ref<HTMLElement>()
const input = ref('')
const inputRef = ref<HTMLTextAreaElement>()
const selectedFiles = ref<File[]>([])
const fileInputRef = ref<HTMLInputElement>()
const showSupplementInput = ref(false)
const supplementInput = ref('')
const showRefDrawer = ref(false)
const showQueuePanel = ref(false)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index: number, event: DragEvent) {
  event.preventDefault()
  const processingIdx = props.requestQueue.findIndex((r) => r.status === 'processing')
  if (processingIdx !== -1 && index <= processingIdx) {
    dragOverIndex.value = null
    return
  }
  dragOverIndex.value = index
}

function onDrop(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const processingIdx = props.requestQueue.findIndex((r) => r.status === 'processing')
  if (processingIdx !== -1 && index <= processingIdx) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const newQueue = [...props.requestQueue]
  const [moved] = newQueue.splice(dragIndex.value, 1)
  newQueue.splice(index, 0, moved)
  emit('reorder-queue', newQueue)
  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function sendMsg() {
  if (!input.value.trim() && selectedFiles.value.length === 0) return
  const text = input.value.trim()
  const files = [...selectedFiles.value]
  input.value = ''
  selectedFiles.value = []
  emit('send', text, files)
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    for (const file of Array.from(target.files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (['pdf', 'docx', 'txt'].includes(ext)) {
        if (file.size > 10 * 1024 * 1024) {
          ElMessage.warning(`${file.name} 超过 10MB 限制`)
          continue
        }
        const mimeOk = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain'
        ].includes(file.type)
        if (!mimeOk && file.type && file.type !== '' && ext === 'pdf') {
          ElMessage.warning(`文件类型不匹配: ${file.name}`)
          continue
        }
        selectedFiles.value.push(file)
      } else {
        ElMessage.warning(`不支持的文件格式: ${file.name}`)
      }
    }
    target.value = ''
  }
}

function autoResizeInput() {
  const el = inputRef.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
}

function removeSelectedFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

function handleChatScroll() {
  const el = chatRef.value
  if (!el) return
  emit('chat-scroll', {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight
  })
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

function getScrollHeight(): number {
  return chatRef.value?.scrollHeight ?? 0
}

function restoreScrollPosition(prevScrollHeight: number) {
  nextTick(() => {
    const el = chatRef.value
    if (el) {
      el.scrollTop = el.scrollHeight - prevScrollHeight
    }
  })
}

// reasoning 框自动滚动
const reasoningBoxRefs = new Map<string, HTMLElement>()
const reasoningAutoScroll = reactive<Record<string, boolean>>({})

function onReasoningScroll(msgId: string, e: Event) {
  const el = e.target as HTMLElement
  reasoningAutoScroll[msgId] = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function scrollReasoningToBottom(msgId: string) {
  nextTick(() => {
    requestAnimationFrame(() => {
      reasoningBoxRefs.get(msgId)?.scrollTo({ top: 99999, behavior: 'instant' })
    })
  })
}

watch(
  () =>
    props.messages.map((m) => ({
      id: m.id,
      reasoning: m.reasoning,
      showReasoning: m.showReasoning
    })),
  (newMsgs, oldMsgs) => {
    for (const msg of newMsgs) {
      if (!msg.id || !msg.showReasoning || !msg.reasoning) continue
      const old = oldMsgs?.find((m) => m.id === msg.id)
      if (!old) {
        reasoningAutoScroll[String(msg.id)] = true
      }
      if (reasoningAutoScroll[String(msg.id)] !== false) {
        scrollReasoningToBottom(String(msg.id))
      }
    }
  },
  { deep: false }
)

function setInput(text: string) {
  input.value = text
}

function openSupplementDialog() {
  supplementInput.value = ''
  showSupplementInput.value = true
}

function submitSupplement() {
  if (!supplementInput.value.trim()) return
  const text = supplementInput.value
  supplementInput.value = ''
  showSupplementInput.value = false
  emit('submit-supplement', text)
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
.chat-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages-area {
  display: flex;
  flex-direction: column-reverse;
  flex: 1;
  min-height: 0;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px 15px;
  min-height: 0;
  position: relative;
}

.chat-card :deep(.el-card__body) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-title {
  font-weight: 500;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}

.message-item {
  margin-bottom: 12px;
}

.message-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  max-width: 100%;
}

.message-bubble :deep(p) {
  margin: 0;
}
.message-bubble :deep(p + p) {
  margin-top: 0.4em;
}

.message-item.user .message-bubble {
  background: #409eff;
  color: white;
  margin-left: auto;
  width: fit-content;
  max-width: 85%;
  white-space: pre-wrap;
}

.message-item.assistant .message-bubble {
  background: #f0f0f0;
  color: #333;
  width: fit-content;
  max-width: 85%;
}

.loading-spinner {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #999;
  font-size: 14px;
}

.inline-optimizations {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e5e5e5;
}

.ref-docs-header {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.chat-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0 0;
  border-top: 1px solid #e5e5e5;
}

.selected-files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: #fafafa;
  border-radius: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.selected-file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #666;
  background: #fff;
  padding: 4px 8px;
  border-radius: 4px;
}

.selected-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.remove-file-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: #f0f0f0;
  color: #999;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  transition: background 0.2s;
}

.remove-file-btn:hover {
  background: #e0e0e0;
  color: #666;
}

.input-actions {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  justify-content: space-between;
}

.attach-btn {
  width: 40px;
  height: 40px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background: #fff;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.attach-btn:hover {
  border-color: #409eff;
  color: #409eff;
  background: #f0f7ff;
}

.ref-drawer-btn {
  height: 40px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background: #fff;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  transition: all 0.2s;
  flex-shrink: 0;
  font-size: 13px;
}

.ref-drawer-btn:hover {
  border-color: #409eff;
  color: #409eff;
  background: #f0f7ff;
}

.ref-btn-text {
  line-height: 1;
}

.drawer-empty {
  text-align: center;
  color: #999;
  font-size: 14px;
  padding: 40px 0;
}

.drawer-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.drawer-file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
}

.drawer-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
  color: #333;
}

.input-wrapper {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 8px 12px;
  background: #fff;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.input-wrapper:focus-within {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

.input-wrapper textarea {
  width: 100%;
  min-height: 20px;
  max-height: 120px;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  background: transparent;
  color: #333;
  font-family: inherit;
}

.input-wrapper textarea::placeholder {
  color: #bbb;
}

.input-wrapper textarea:disabled {
  background: #f5f5f5;
  color: #999;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.stop-btn {
  background: #ef4444;
  border-color: #ef4444;
}
.stop-btn:hover {
  background: #dc2626;
  border-color: #dc2626;
}

.send-btn:hover:not(:disabled) {
  background: #3a8ee6;
}

.send-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.history-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  color: #999;
  font-size: 12px;
}

.reasoning-toggle {
  margin-top: 4px;
}

.reasoning-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: #909399;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.reasoning-btn:hover {
  background: #f0f0f0;
}

.reasoning-icon {
  font-size: 10px;
  transition: transform 0.2s;
}

.reasoning-label {
  line-height: 1;
}

.reasoning-box {
  margin-top: 6px;
  padding: 10px 14px;
  background: #f9f9f9;
  border-left: 3px solid #d0d0d0;
  border-radius: 4px;
  font-size: 12px;
  color: #888;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.chat-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-bottom: 4px;
}

.chat-error-text {
  flex: 1;
  font-size: 12px;
  color: #dc2626;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-indicator {
  flex-shrink: 0;
  width: 100%;
  border-top: 1px solid #eee;
  background: #fafafa;
}

.queue-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: #fafafa;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  transition: background 0.2s;
}

.queue-toggle:hover {
  background: #e8e8e8;
}

.queue-toggle-text {
  flex: 1;
  text-align: left;
}

.queue-panel {
  border-bottom: 1px solid #e5e5e5;
  max-height: 240px;
  overflow-y: auto;
}

.queue-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 12px;
  font-weight: 500;
  color: #333;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: #666;
}

.queue-item.canceled {
  opacity: 0.4;
  text-decoration: line-through;
}

.queue-item.dragging {
  opacity: 0.5;
}

.queue-item.drag-over {
  border-top: 2px solid #409eff;
}

.drag-handle {
  cursor: grab;
  color: #ccc;
  font-size: 14px;
  margin-right: 2px;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.queue-status {
  font-size: 12px;
  width: 18px;
  text-align: center;
}

.queue-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-cancel-btn {
  width: 18px;
  height: 18px;
  border: none;
  background: #f0f0f0;
  color: #999;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  transition: background 0.2s;
}

.queue-cancel-btn:hover {
  background: #e0e0e0;
  color: #e74c3c;
}

.interrupted-text {
  color: #999;
  font-size: 12px;
}

.processing-cursor :deep(:last-child)::after {
  content: '▊';
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
