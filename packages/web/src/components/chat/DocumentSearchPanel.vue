<template>
  <div
    v-if="visible"
    class="doc-search-panel absolute left-0 right-0 bottom-full mb-2 z-50 max-h-[280px] overflow-y-auto"
  >
    <div class="doc-search-panel__header flex items-center gap-2 px-4 py-2.5 text-sm">
      <el-icon :size="14">
        <Search />
      </el-icon>
      <span>{{ search || placeholder }}</span>
    </div>
    <div v-if="loading" class="px-4 py-6 text-center text-sm text-(--text-muted)">
      <el-icon class="animate-spin">
        <Loading />
      </el-icon>
      搜索中...
    </div>
    <div v-else-if="list.length === 0" class="px-4 py-6 text-center text-sm text-(--text-muted)">
      {{ search ? `未找到匹配的${label}` : `文档库中暂无${label}，请先上传` }}
    </div>
    <div
      v-for="doc in list"
      :key="doc.id"
      class="doc-search-panel__row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors text-sm"
      @click="$emit('select', doc)"
    >
      <el-icon class="shrink-0 text-(--text-muted)" :size="15">
        <Document />
      </el-icon>
      <div class="flex-1 min-w-0">
        <div class="truncate text-(--text)">
          {{ doc.localName }}
        </div>
        <div class="text-xs text-(--text-muted)">
          {{ formatRelative(doc.createdAt) }}
        </div>
      </div>
      <span class="shrink-0 text-xs text-(--text-muted)">{{ doc.fileType?.toUpperCase() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search, Loading, Document } from '@element-plus/icons-vue'
import { formatRelative } from '@/lib/format'
import type { DocItem } from '@/types/document'

withDefaults(
  defineProps<{
    visible: boolean
    search: string
    list: DocItem[]
    loading: boolean
    placeholder?: string
    label?: string
  }>(),
  { placeholder: '搜索文档库...', label: '文档' }
)

defineEmits<{ select: [doc: DocItem] }>()
</script>

<style scoped>
.doc-search-panel {
  border-radius: var(--radius-panel);
  background: var(--surface);
  box-shadow: var(--shadow-panel);
}

.doc-search-panel__header {
  border-bottom: 1px solid color-mix(in oklab, var(--border) 48%, transparent);
  background: color-mix(in oklab, var(--surface-raised) 76%, transparent);
  color: var(--text-secondary);
}

.doc-search-panel__row:hover {
  background: color-mix(in oklab, var(--surface-hover) 72%, transparent);
}
</style>
