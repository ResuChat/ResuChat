<template>
  <div v-if="queue.length > 1" class="queue-panel flex-shrink-0 w-full">
    <div v-if="showPanel" class="queue-panel__body max-h-[240px] overflow-y-auto">
      <div
        class="queue-panel__header flex justify-between items-center px-2.5 py-2 text-xs font-medium"
      >
        <span>消息队列</span>
        <button class="queue-action-btn text-xs" @click="$emit('cancelAll')">全部取消</button>
      </div>
      <div
        v-for="(item, idx) in queue"
        :key="item.id"
        class="queue-row flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
        :class="{
          'opacity-40 line-through': item.canceled,
          'opacity-50': item.status === 'completed',
          '!border-t-2 !border-(--primary)': item.dragOver
        }"
        :draggable="item.status === 'pending'"
        @dragstart="item.status === 'pending' && onDragStart($event, idx)"
        @dragover.prevent
        @dragend="onDragEnd"
      >
        <button
          v-if="item.status === 'pending'"
          type="button"
          class="queue-drag-handle text-sm mr-0.5 select-none"
          title="拖动排序"
        >
          ⠿
        </button>
        <span class="text-xs w-[18px] text-center">{{
          item.status === 'completed'
            ? '✓'
            : item.status === 'processing'
              ? '⋯'
              : item.canceled
                ? '✕'
                : '⏳'
        }}</span>
        <span
          class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-(--text-secondary)"
        >
          {{ getLabel(item) }}
        </span>
        <button
          v-if="item.status === 'pending'"
          type="button"
          class="queue-cancel-btn w-[18px] h-[18px] flex items-center justify-center rounded-full cursor-pointer text-[11px] transition-colors"
          @click="$emit('cancel', item.id)"
        >
          ✕
        </button>
      </div>
    </div>
    <button
      class="queue-toggle flex items-center gap-1.5 w-full px-2.5 py-1.5 border-none cursor-pointer text-xs transition-colors"
      @click="showPanel = !showPanel"
    >
      <span class="flex-1 text-left">{{
        showPanel ? '收起队列' : `消息队列 (${pendingCount})`
      }}</span>
      <el-icon :size="12"> <ArrowDown v-if="!showPanel" /><ArrowUp v-else /> </el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import type { QueuedRequest } from '@/types/chat'

defineProps<{ queue: QueuedRequest[]; pendingCount: number }>()
defineEmits<{ cancelAll: []; cancel: [id: string] }>()

const showPanel = ref(false)

function getLabel(item: QueuedRequest) {
  return item.label || item.type
}
function onDragStart(e: DragEvent, idx: number) {
  e.dataTransfer?.setData('text/plain', String(idx))
}
function onDragEnd() {}
</script>
<style scoped>
.queue-panel {
  background: color-mix(in oklab, var(--surface) 88%, transparent);
}

.queue-panel__body {
  border-top: 1px solid color-mix(in oklab, var(--border) 46%, transparent);
  border-bottom: 1px solid color-mix(in oklab, var(--border) 46%, transparent);
}

.queue-panel__header {
  border-bottom: 1px solid color-mix(in oklab, var(--border) 42%, transparent);
  background: color-mix(in oklab, var(--surface-raised) 72%, transparent);
  color: var(--text);
}

.queue-row {
  transition: background-color 0.2s ease;
}

.queue-row:hover {
  background: transparent;
}

.queue-action-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  padding: 4px 8px;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;
}

.queue-action-btn:hover {
  color: var(--primary);
  background: color-mix(in oklab, var(--control-hover) 38%, transparent);
}

.queue-drag-handle {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: grab;
  border-radius: 6px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;
}

.queue-drag-handle:hover {
  color: var(--primary);
  background: color-mix(in oklab, var(--control-hover) 38%, transparent);
}

.queue-drag-handle:active {
  cursor: grabbing;
}

.queue-cancel-btn {
  border: none;
  background: var(--control-bg);
  color: var(--text-muted);
}

.queue-cancel-btn:hover {
  background: color-mix(in oklab, var(--control-hover) 38%, transparent);
  color: var(--primary);
}

.queue-toggle {
  background: var(--surface-raised);
  color: var(--text-secondary);
}

.queue-toggle:hover {
  background: transparent;
  color: var(--primary);
}
</style>
