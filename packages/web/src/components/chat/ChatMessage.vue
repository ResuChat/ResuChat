<template>
  <div class="mb-3">
    <!-- 用户消息 -->
    <div v-if="msg.role === 'user'" class="flex justify-end">
      <div
        class="message-bubble message-bubble--user px-3 py-2 rounded-lg text-[13px] leading-relaxed break-words w-fit max-w-[85%] whitespace-pre-wrap"
      >
        <span v-if="msg.content">{{ msg.content }}</span>
        <div
          v-if="msg.attachments?.length"
          class="message-attachments flex flex-col gap-1.5"
          :class="{ 'mt-2': msg.content }"
        >
          <div
            v-for="attachment in msg.attachments"
            :key="attachmentKey(attachment)"
            class="message-attachment-row flex items-center gap-1.5 rounded-md px-2 py-1 whitespace-normal"
          >
            <el-icon class="shrink-0" :size="13">
              <Document />
            </el-icon>
            <span class="message-attachment-name min-w-0 flex-1 truncate">{{
              attachment.name
            }}</span>
            <span class="message-attachment-source shrink-0 text-[11px]">{{
              attachmentSourceLabel(attachment.source)
            }}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- AI 消息 -->
    <div v-else>
      <div
        class="message-bubble message-bubble--assistant px-3 py-2 rounded-lg text-[13px] leading-relaxed break-words w-fit max-w-[85%]"
      >
        <!-- 内容 -->
        <div
          v-if="content"
          :class="{ 'streaming-cursor': isLoading && isLast && msg.status !== 'interrupted' }"
          v-html="renderedContent"
        />
        <!-- streaming 状态 -->
        <div
          v-if="isLoading && isLast && !content && msg.status !== 'interrupted'"
          class="flex items-center gap-2 text-xs text-(--text-muted)"
        >
          <el-icon class="animate-spin">
            <Loading />
          </el-icon>
          <span>正在思考...</span>
        </div>
        <span v-else-if="msg.status === 'interrupted'" class="text-xs text-(--text-muted)"
          >已中断</span
        >
      </div>
      <!-- 推理（消息框下方） -->
      <div v-if="msg.reasoning">
        <button
          class="reasoning-toggle mt-1 inline-flex items-center gap-1 border-none cursor-pointer text-xs px-2 py-1 rounded transition-colors"
          @click="$emit('toggleReasoning', msg.id)"
        >
          <span class="text-[10px]">{{ msg.showReasoning ? '▼' : '▶' }}</span>
          <span>{{ msg.showReasoning ? '收起思考过程' : '查看思考过程' }}</span>
        </button>
        <div
          v-if="msg.showReasoning && msg.reasoning"
          ref="reasoningBoxRef"
          class="reasoning-box mt-1.5 px-3.5 py-2.5 rounded border-l-[3px] text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[200px] max-w-[300px] overflow-y-auto"
          @scroll="onReasoningScroll"
        >
          <span>{{ msg.reasoning }}</span>
        </div>
      </div>
      <!-- 优化建议卡片 -->
      <div
        v-if="msg.optimizations?.length"
        class="mt-2.5 border-t border-dashed border-(--border) pt-2.5"
      >
        <div class="mb-2 text-xs text-(--text-muted)">优化建议</div>
        <slot name="optimizations" :msg="msg" :msg-index="msgIndex" />
      </div>
      <!-- 修改预览卡片 -->
      <div
        v-if="msg.modifications?.length"
        class="mt-2.5 border-t border-dashed border-(--border) pt-2.5"
      >
        <div class="mb-2 text-xs text-(--text-muted)">修改预览</div>
        <slot name="modifications" :msg="msg" :msg-index="msgIndex" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { Document, Loading } from '@element-plus/icons-vue'
import { renderSafeMarkdown } from '@/lib/markdown'
import type { Message, MessageAttachment } from '@/types/chat'

const props = defineProps<{
  msg: Message
  msgIndex: number
  isLoading: boolean
  isLast: boolean
  content: string
}>()
defineEmits<{ toggleReasoning: [msgId: string] }>()

function renderMarkdown(text: string) {
  return renderSafeMarkdown(text)
}

const renderedContent = computed(() => renderMarkdown(props.content))

function attachmentKey(attachment: MessageAttachment) {
  return `${attachment.source}-${attachment.refId ?? attachment.docId ?? attachment.name}`
}

function attachmentSourceLabel(source: MessageAttachment['source']) {
  return source === 'library' ? '文档库' : '上传'
}

// ---- reasoning 自动滚动 ----
const reasoningBoxRef = ref<HTMLElement>()
const reasoningAutoScroll = ref(true)

function onReasoningScroll() {
  const el = reasoningBoxRef.value
  if (!el) return
  reasoningAutoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function scrollReasoningToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      reasoningBoxRef.value?.scrollTo({ top: 99999, behavior: 'instant' })
    })
  })
}

// 流式更新时自动跟随滚动
watch(
  () => props.msg.reasoning,
  () => {
    if (reasoningAutoScroll.value) scrollReasoningToBottom()
  }
)

// 首次展开时滚动到底部
watch(
  () => props.msg.showReasoning,
  (show) => {
    if (show) {
      reasoningAutoScroll.value = true
      scrollReasoningToBottom()
    }
  }
)
</script>

<style scoped>
.message-bubble {
  border: 0;
}

.message-bubble--user {
  background: var(--primary);
  color: white;
}

.message-attachments {
  width: min(320px, 100%);
}

.message-attachment-row {
  background: color-mix(in oklab, white 16%, transparent);
}

.message-attachment-name {
  color: rgba(255, 255, 255, 0.96);
}

.message-attachment-source {
  color: rgba(255, 255, 255, 0.72);
}

.message-bubble--assistant {
  background: var(--chat-bubble-assistant);
  color: var(--text);
}

.reasoning-toggle {
  background: transparent;
  color: var(--text-muted);
}

.reasoning-toggle:hover {
  background: transparent;
  color: var(--primary);
}

.reasoning-box {
  border-left-color: var(--border);
  background: var(--chat-input-bg);
  color: var(--text-secondary);
}

.streaming-cursor :deep(> :last-child)::after {
  content: '▊';
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
