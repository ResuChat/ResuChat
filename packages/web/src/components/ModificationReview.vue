<template>
  <div class="modification-review">
    <div class="ref-docs-header">修改预览</div>
    <div class="modification-item">
      <div class="modification-header">
        <span
          ><strong>{{ item.field }}</strong></span
        >
        <div v-if="item.reason" class="mod-reason">
          {{ item.reason }}
        </div>
      </div>
      <div class="modification-content">
        <div class="mod-label">修改前：</div>
        <div class="mod-text original">
          <RenderSuggestion :text="item.current" />
        </div>
        <div class="mod-label">修改后：</div>
        <div class="mod-text modified">
          <RenderSuggestion :text="item.suggestion" />
        </div>
      </div>
      <div class="modification-actions">
        <el-button
          type="primary"
          size="small"
          :disabled="disabled"
          @click="$emit('accept', item, msgIndex, modIdx)"
        >
          接受
        </el-button>
        <el-button
          size="small"
          :disabled="disabled"
          @click="$emit('supplement', item, msgIndex, modIdx)"
        >
          补充
        </el-button>
        <el-button size="small" :disabled="disabled" @click="$emit('reject', msgIndex, modIdx)">
          拒绝
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModificationItem } from '@/types/chat'
import RenderSuggestion from './RenderSuggestion.vue'

const props = defineProps<{
  item: ModificationItem
  msgIndex: number
  modIdx: number
  disabled?: boolean
}>()

defineEmits<{
  accept: [item: ModificationItem, msgIndex: number, modIdx: number]
  supplement: [item: ModificationItem, msgIndex: number, modIdx: number]
  reject: [msgIndex: number, modIdx: number]
}>()
</script>

<style scoped>
.modification-review {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e5e5e5;
}

.ref-docs-header {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.modification-item {
  font-size: 12px;
  color: #666;
  background: #f9f9f9;
  border-radius: 6px;
  margin-bottom: 8px;
  padding: 10px;
}

.modification-header {
  margin-bottom: 6px;
}

.mod-reason {
  color: #999;
  font-size: 11px;
  margin-top: 2px;
}

.modification-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mod-label {
  color: #999;
  font-size: 11px;
}

.mod-text {
  color: #333;
  line-height: 1.4;
  white-space: pre-wrap;
}

.mod-text.modified {
  background: #f0f7ff;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #d0e3ff;
  font-size: 12px;
}

.mod-text.original {
  background: #fff7f0;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #ffd0c8;
  font-size: 12px;
}

.modification-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
