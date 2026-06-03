<template>
  <div class="ref-doc-item">
    <div class="ref-doc-header">
      <span
        ><strong>{{ item.field }}</strong> ({{ item.priority }})</span
      >
      <el-button type="primary" size="small" :disabled="disabled" @click="$emit('apply', item)">
        采纳
      </el-button>
    </div>
    <div v-if="item.reason" class="opt-reason">
      {{ item.reason }}
    </div>
    <div class="ref-doc-content">
      <div class="ref-doc-label">原文：</div>
      <div class="ref-doc-text original-text">
        <RenderSuggestion :text="item.current" />
      </div>
      <div class="ref-doc-label">建议：</div>
      <div class="ref-doc-text suggestion-text">
        <RenderSuggestion :text="item.suggestion" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OptimizationItem } from '@/types/chat'
import RenderSuggestion from './RenderSuggestion.vue'

defineProps<{
  item: OptimizationItem
  disabled?: boolean
}>()

defineEmits<{
  apply: [item: OptimizationItem]
}>()
</script>

<style scoped>
.ref-doc-item {
  font-size: 12px;
  color: #666;
  background: #f9f9f9;
  border-radius: 6px;
  margin-bottom: 8px;
  padding: 10px;
}

.ref-doc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.opt-reason {
  color: #999;
  font-size: 11px;
  margin-bottom: 6px;
}

.ref-doc-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ref-doc-label {
  color: #999;
  font-size: 11px;
}

.ref-doc-text {
  color: #333;
  line-height: 1.4;
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.original-text {
  background: #fff7f0;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #ffd0c8;
  -webkit-line-clamp: initial;
  display: block;
}

.suggestion-text {
  background: #e6f7ff;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #91d5ff;
  -webkit-line-clamp: initial;
  display: block;
}
</style>
