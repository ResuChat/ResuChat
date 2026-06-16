<template>
  <div class="h-screen flex flex-col items-center justify-center bg-(--primary-bg) px-4">
    <div class="text-center mb-8 text-(--text)">
      <h1 class="text-[32px] font-bold mb-2">聊简历</h1>
      <p class="text-base opacity-85">AI 驱动的简历优化体验</p>
    </div>

    <div class="glass-card relative w-full max-w-[680px] rounded-2xl">
      <div class="relative">
        <!-- Prompt 输入 -->
        <textarea
          ref="promptRef"
          v-model="prompt"
          placeholder="有什么可以帮助你的？ (@ 引用文档库中的简历)"
          rows="3"
          class="h-[96px] w-full resize-none border-none bg-transparent px-4 pt-3 pb-6 font-[inherit] text-sm leading-relaxed text-(--text) outline-none"
          @input="onPromptInput"
          @keydown="onKeydown"
        />

        <!-- 已选文件/文档（位于输入框底部预留槽，不参与文档流） -->
        <div
          v-if="selectedFile || selectedDoc"
          class="absolute left-3 right-3 bottom-1 flex items-center pointer-events-none"
        >
          <el-tag
            type="primary"
            effect="plain"
            size="small"
            closable
            class="max-w-full pointer-events-auto"
            @close="clearSelection"
          >
            <span class="inline-block max-w-full truncate align-bottom">
              {{ selectedFile?.name || selectedDoc?.localName }}
            </span>
          </el-tag>
        </div>
      </div>

      <!-- 操作栏 -->
      <div class="flex items-center justify-between px-3 pb-2">
        <div class="flex items-center gap-1">
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.docx,.txt,.md"
            class="hidden"
            @change="onFileChange"
          />
          <button
            class="toolbar-icon-btn w-8 h-8 flex items-center justify-center cursor-pointer"
            title="上传简历文件"
            @click="fileInput?.click()"
          >
            <el-icon :size="18">
              <Paperclip />
            </el-icon>
          </button>
        </div>
        <button
          class="start-btn w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
          :disabled="!selectedFile && !selectedDoc"
          :class="{ 'start-btn--ready': selectedFile || selectedDoc }"
          title="开始优化"
          @click="handleStart"
        >
          <el-icon :size="16">
            <Promotion />
          </el-icon>
        </button>
      </div>

      <!-- @ 文档搜索面板 -->
      <DocumentSearchPanel
        :visible="showDocPanel"
        :search="docSearch"
        :list="docList"
        :loading="docLoading"
        placeholder="搜索文档库中的简历..."
        label="简历"
        @select="selectDoc"
      />
    </div>

    <!-- 上传中遮罩 -->
    <transition name="fade">
      <div
        v-if="uploading"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      >
        <div class="w-[min(400px,calc(100vw-32px))] rounded-lg bg-(--bg) p-8 text-center">
          <el-icon class="mb-4 animate-spin text-(--primary)" :size="36">
            <Loading />
          </el-icon>
          <el-progress :percentage="Math.round(displayProgress)" :stroke-width="8" />
          <p class="mt-4 text-sm text-(--text-secondary)">
            {{ statusText }}
          </p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading, Paperclip, Promotion } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat.store'
import { api } from '@/api'
import { resolveStartConversationQuery } from '@/lib/chat-page-helpers'
import { useDocSearch } from '@/composables/useDocSearch'
import DocumentSearchPanel from '@/components/chat/DocumentSearchPanel.vue'
import type { DocItem } from '@/types/document'

const router = useRouter()
const chatStore = useChatStore()
const promptRef = ref<HTMLTextAreaElement>()
const fileInput = ref<HTMLInputElement>()
const prompt = ref('')
const selectedFile = ref<File | null>(null)
const selectedDoc = ref<{ id: number; localName: string } | null>(null)
const uploading = ref(false)
const progress = ref(0)
const statusText = ref('')
const displayProgress = ref(0)
const progressStageStartedAt = ref(Date.now())

function getDisplayProgressCap() {
  if (progress.value >= 100) return 100
  if (progress.value >= 80) return 94
  if (progress.value >= 30) return 74
  return 18
}

function createConversationId() {
  const suffix =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)
  return `conv_${Date.now()}_${suffix}`
}

async function pollStartProgress(conversationId: string) {
  const data = (await api.get(`/conversations/start/progress/${conversationId}`, {
    timeout: 10000
  })) as { progress: number; status: string }

  if (data.progress >= progress.value) {
    if (data.progress !== progress.value) {
      progressStageStartedAt.value = Date.now()
    }
    progress.value = data.progress
    statusText.value = data.status
  }
}

function startProgressAnimation() {
  return window.setInterval(() => {
    const cap = getDisplayProgressCap()
    const elapsedSeconds = (Date.now() - progressStageStartedAt.value) / 1000
    const stageDrift = Math.min(2.4, Math.log1p(elapsedSeconds) * 0.42)
    const movingCap = Math.min(99, cap + stageDrift)
    if (displayProgress.value >= movingCap) return

    const diff = movingCap - displayProgress.value
    const step = Math.max(0.04, diff * 0.055)
    displayProgress.value = Math.min(movingCap, displayProgress.value + step)
  }, 150)
}

function getStartErrorMessage(error: unknown) {
  const maybeAxiosError = error as {
    response?: { data?: { error?: string; message?: string } }
    message?: string
  }

  return (
    maybeAxiosError.response?.data?.error ||
    maybeAxiosError.response?.data?.message ||
    maybeAxiosError.message ||
    '创建会话失败，请稍后重试'
  )
}

// @ 文档搜索
const {
  showDocPanel,
  docSearch,
  docList,
  docLoading,
  hideDocPanel,
  onInput: onDocInput,
  clearAtText
} = useDocSearch({ contentCategory: 'resume', parseStatus: 'done' })

function clearSelection() {
  selectedFile.value = null
  selectedDoc.value = null
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) {
    selectedDoc.value = null
    selectedFile.value = input.files[0]
  }
  input.value = ''
}

function onPromptInput() {
  onDocInput(promptRef.value)
}

function selectDoc(doc: DocItem) {
  selectedFile.value = null
  selectedDoc.value = { id: doc.id, localName: doc.localName }
  const nextPrompt = clearAtText(promptRef.value)
  if (nextPrompt !== undefined) {
    prompt.value = nextPrompt
  }
  hideDocPanel()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') hideDocPanel()
}

async function handleStart() {
  if (!selectedFile.value && !selectedDoc.value) return

  uploading.value = true
  progress.value = 0
  displayProgress.value = 0
  progressStageStartedAt.value = Date.now()
  statusText.value = '正在准备...'

  const query = resolveStartConversationQuery(prompt.value)
  const conversationId = createConversationId()
  const progressTimer = window.setInterval(() => {
    pollStartProgress(conversationId).catch(() => {
      /* 进度查询失败不打断主请求 */
    })
  }, 500)
  const animationTimer = startProgressAnimation()

  try {
    const result = selectedDoc.value
      ? ((await api.post(
          '/conversations/start-from-doc',
          { conversationId, docId: selectedDoc.value.id, query },
          {
            timeout: 240000
          }
        )) as { conversationId: string; initialPrompt: string })
      : await (async () => {
          const formData = new FormData()
          formData.append('conversationId', conversationId)
          formData.append('files', selectedFile.value!)
          formData.append('query', query)
          return (await api.post('/conversations/start', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 240000
          })) as { conversationId: string; initialPrompt: string }
        })()

    window.clearInterval(progressTimer)
    statusText.value = '完成'
    progress.value = 100
    await new Promise<void>((resolve) => {
      const finishTimer = window.setInterval(() => {
        if (displayProgress.value >= 99.9) {
          displayProgress.value = 100
          window.clearInterval(finishTimer)
          resolve()
          return
        }
        displayProgress.value = Math.min(
          100,
          Math.round(
            (displayProgress.value + Math.max(0.5, (100 - displayProgress.value) / 8)) * 10
          ) / 10
        )
      }, 16)
    })
    window.clearInterval(animationTimer)
    chatStore.setConversationId(result.conversationId)
    chatStore.setPrompt(result.initialPrompt || query)
    chatStore.fetchConversations(1, 50)
    await new Promise((resolve) => setTimeout(resolve, 500))
    await router.push(`/app/chat/${result.conversationId}`)
  } catch (error) {
    window.clearInterval(progressTimer)
    window.clearInterval(animationTimer)
    uploading.value = false
    ElMessage.error(getStartErrorMessage(error))
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

:root .glass-card {
  border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--border));
  background: color-mix(in oklab, var(--bg) 78%, var(--primary-bg));
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 14px 34px color-mix(in oklab, var(--primary) 10%, transparent);
}

:root.dark .glass-card {
  border-color: color-mix(in oklab, var(--primary) 24%, var(--border));
  background: color-mix(in oklab, var(--bg-secondary) 82%, var(--primary-bg));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 18px 42px rgb(0 0 0 / 28%);
}

.start-btn {
  border: 0;
  background: transparent;
  color: var(--text-muted);
}

.start-btn--ready {
  background: var(--primary);
  color: white;
}

.start-btn--ready:hover {
  background: var(--primary-dark);
}

.start-btn:disabled {
  cursor: not-allowed;
  background: var(--surface-muted);
}
</style>
