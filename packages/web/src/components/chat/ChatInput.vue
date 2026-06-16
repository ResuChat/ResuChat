<template>
  <div class="chat-input-area flex flex-col gap-2 border-t border-(--border) px-4 pt-2.5 pb-2.5">
    <div class="chat-input-box relative">
      <!-- @ 文档搜索面板 -->
      <DocumentSearchPanel
        ref="docPanelRef"
        :visible="showDocPanel"
        :search="docSearch"
        :list="docList"
        :loading="docLoading"
        @select="selectDoc"
      />
      <textarea
        ref="textareaRef"
        v-model="input"
        placeholder="输入消息，Shift+Enter 换行，Enter 发送"
        rows="3"
        class="chat-input-textarea w-full h-[96px] border-none outline-none resize-none px-3 pt-2.5 pb-6 text-sm leading-relaxed"
        @keydown="onKeydown"
        @input="onInput"
      />
      <div
        v-if="pendingFiles.length || selectedDocs.length"
        class="absolute left-2 right-2 bottom-1 flex items-center gap-1 overflow-x-auto overflow-y-hidden pointer-events-none"
      >
        <el-tag
          v-for="doc in selectedDocs"
          :key="'doc-' + doc.id"
          type="primary"
          effect="plain"
          size="small"
          closable
          class="max-w-[180px] shrink-0 pointer-events-auto"
          @close="removeDoc(doc.id)"
        >
          <span class="inline-block max-w-full truncate align-bottom">
            {{ doc.localName }}
          </span>
        </el-tag>
        <el-tag
          v-for="(file, idx) in pendingFiles"
          :key="'file-' + idx"
          type="primary"
          effect="plain"
          size="small"
          closable
          class="max-w-[180px] shrink-0 pointer-events-auto"
          @close="removeFile(idx)"
        >
          <span class="inline-block max-w-full truncate align-bottom">
            {{ file.name }}
          </span>
        </el-tag>
      </div>
    </div>
    <div class="flex gap-2 items-center justify-between">
      <div class="flex gap-2 items-center">
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.docx,.txt,.md"
          multiple
          class="hidden"
          @change="onFileChange"
        />
        <button
          class="toolbar-icon-btn w-10 h-10 flex items-center justify-center flex-shrink-0 cursor-pointer"
          title="附加文件"
          @click="fileInput?.click()"
        >
          <el-icon :size="18">
            <Paperclip />
          </el-icon>
        </button>
        <button
          class="toolbar-icon-btn h-10 flex items-center gap-1 px-3 flex-shrink-0 cursor-pointer text-[13px] relative"
          title="参考资料"
          @click="$emit('openRefDrawer')"
        >
          <el-icon :size="16"> <FolderOpened /> </el-icon
          ><span class="hidden sm:inline">参考资料</span>
          <span
            v-if="referenceCount > 0"
            class="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-(--el-color-danger) px-1 text-[10px] font-medium leading-none text-white"
            >{{ referenceCount > 99 ? '99+' : referenceCount }}</span
          >
        </button>
      </div>
      <div class="flex gap-2 items-center">
        <button
          v-if="isProcessing"
          class="stop-btn w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer"
          title="停止"
          @click="$emit('stop')"
        >
          <el-icon :size="16">
            <Close />
          </el-icon>
        </button>
        <button
          class="send-btn w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!input.trim() && !selectedDocs.length && !pendingFiles.length"
          title="发送"
          @click="handleSend"
        >
          <el-icon :size="16">
            <Promotion />
          </el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Paperclip, FolderOpened, Close, Promotion } from '@element-plus/icons-vue'
import { useDocSearch } from '@/composables/useDocSearch'
import DocumentSearchPanel from './DocumentSearchPanel.vue'
import type { MessageAttachment } from '@/types/chat'

const props = withDefaults(
  defineProps<{ text: string; isProcessing: boolean; referenceCount?: number }>(),
  { referenceCount: 0 }
)
const emit = defineEmits<{
  send: [text: string, files: File[], docIds: number[], attachments: MessageAttachment[]]
  openRefDrawer: []
  stop: []
}>()
const fileInput = ref<HTMLInputElement>()
const textareaRef = ref<HTMLTextAreaElement>()
const input = ref(props.text)
const pendingFiles = ref<File[]>([])
const selectedDocs = ref<{ id: number; localName: string; fileType?: string }[]>([])

// @ 文档搜索
const {
  showDocPanel,
  docSearch,
  docList,
  docLoading,
  hideDocPanel,
  onInput: onDocInput,
  clearAtText
} = useDocSearch()

function onInput() {
  onDocInput(textareaRef.value)
}

function selectDoc(doc: { id: number; localName: string; fileType?: string }) {
  if (!selectedDocs.value.find((d) => d.id === doc.id)) {
    selectedDocs.value = [
      ...selectedDocs.value,
      {
        id: doc.id,
        localName: doc.localName,
        fileType: doc.fileType
      }
    ]
  }
  const nextInput = clearAtText(textareaRef.value)
  if (nextInput !== undefined) {
    input.value = nextInput
  }
  hideDocPanel()
}

function removeDoc(id: number) {
  selectedDocs.value = selectedDocs.value.filter((d) => d.id !== id)
}

// 点击面板外关闭
const docPanelRef = ref<HTMLElement>()
onClickOutside(docPanelRef, hideDocPanel, { ignore: [textareaRef] })

watch(
  () => props.text,
  (v) => {
    input.value = v
  }
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    hideDocPanel()
    return
  }
  if (e.key !== 'Enter' || e.isComposing) return
  e.preventDefault()
  if (e.shiftKey) {
    const ta = e.target as HTMLTextAreaElement
    const s = ta.selectionStart
    input.value = ta.value.slice(0, s) + '\n' + ta.value.slice(ta.selectionEnd)
  } else if (input.value.trim() || selectedDocs.value.length > 0 || pendingFiles.value.length > 0) {
    emit(
      'send',
      input.value,
      pendingFiles.value,
      selectedDocs.value.map((d) => d.id),
      buildMessageAttachments()
    )
    input.value = ''
    pendingFiles.value = []
    selectedDocs.value = []
  }
}
function handleSend() {
  if (input.value.trim() || selectedDocs.value.length > 0 || pendingFiles.value.length > 0) {
    emit(
      'send',
      input.value,
      pendingFiles.value,
      selectedDocs.value.map((d) => d.id),
      buildMessageAttachments()
    )
    input.value = ''
    pendingFiles.value = []
    selectedDocs.value = []
  }
}
function onFileChange(e: Event) {
  const el = e.target as HTMLInputElement
  if (el.files) {
    pendingFiles.value = [...pendingFiles.value, ...Array.from(el.files)]
    el.value = ''
  }
}
function removeFile(idx: number) {
  pendingFiles.value.splice(idx, 1)
  pendingFiles.value = [...pendingFiles.value]
}

function buildMessageAttachments(): MessageAttachment[] {
  return [
    ...selectedDocs.value.map((doc) => ({
      type: 'reference' as const,
      source: 'library' as const,
      name: doc.localName,
      docId: doc.id,
      fileType: doc.fileType
    })),
    ...pendingFiles.value.map((file) => ({
      type: 'reference' as const,
      source: 'upload' as const,
      name: file.name,
      fileType: file.name.split('.').pop()?.toLowerCase() || undefined,
      fileSize: file.size
    }))
  ]
}
</script>
<style scoped>
.chat-input-area {
  background: var(--chat-panel-history-bg, transparent);
}

.chat-input-box {
  border-radius: var(--radius-control);
  background: var(--chat-input-bg);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--border) 72%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition:
    background-color 0.18s,
    box-shadow 0.18s;
}

.chat-input-box:focus-within {
  background: var(--chat-input-bg);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 42%, var(--border));
}

.chat-input-textarea {
  background: transparent;
  color: var(--text);
  caret-color: var(--primary);
  font-family: inherit;
}

.chat-input-textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.78;
}

.toolbar-icon-btn {
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--border) 86%, transparent);
}

.toolbar-icon-btn:hover {
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 72%, var(--border));
}

.send-btn {
  background: var(--primary);
  color: white;
  box-shadow: inset 0 0 0 1px var(--primary);
}

.send-btn:not(:disabled):hover {
  background: var(--primary-dark);
  color: white;
  box-shadow: inset 0 0 0 1px var(--primary-dark);
}

.send-btn:disabled {
  background: color-mix(in oklab, var(--primary) 72%, var(--surface-muted));
  color: color-mix(in oklab, white 78%, var(--text-muted));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 60%, var(--border));
}

.send-btn:disabled:hover {
  background: color-mix(in oklab, var(--primary) 78%, var(--surface-muted));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 78%, var(--border));
  color: color-mix(in oklab, white 86%, var(--text-muted));
}

.stop-btn {
  background: var(--el-color-danger);
  color: white;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--el-color-danger) 72%, var(--border));
}

.stop-btn:hover {
  filter: brightness(0.96);
}
</style>
