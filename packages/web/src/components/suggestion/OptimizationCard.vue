<template>
  <div class="suggestion-card">
    <div class="suggestion-card__header">
      <div class="min-w-0">
        <div class="suggestion-card__title">{{ item.field }}</div>
        <div v-if="item.reason" class="suggestion-card__reason">
          {{ item.reason }}
        </div>
      </div>
      <span class="suggestion-card__badge">{{ item.priority }}</span>
    </div>
    <div class="suggestion-card__body">
      <div class="suggestion-card__label">原文</div>
      <div class="suggestion-card__block suggestion-card__block--current">
        <RenderSuggestion :text="item.current" />
      </div>
      <div class="suggestion-card__label">建议</div>
      <div class="suggestion-card__block suggestion-card__block--suggestion">
        <RenderSuggestion :text="item.suggestion" />
      </div>
    </div>
    <div class="suggestion-card__actions">
      <el-button type="primary" size="small" :disabled="disabled" @click="$emit('apply', item)">
        采纳
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OptimizationItem } from '@/types/chat'
import RenderSuggestion from './RenderSuggestion.vue'
defineProps<{ item: OptimizationItem; disabled?: boolean }>()
defineEmits<{ apply: [item: OptimizationItem] }>()
</script>
