<template>
  <div class="suggestion-card">
    <div class="suggestion-card__header">
      <div class="min-w-0">
        <div class="suggestion-card__title">{{ item.field }}</div>
        <div v-if="item.reason" class="suggestion-card__reason">
          {{ item.reason }}
        </div>
      </div>
    </div>
    <div class="suggestion-card__body">
      <div class="suggestion-card__label">修改前</div>
      <div class="suggestion-card__block suggestion-card__block--current">
        <RenderSuggestion :text="item.current" />
      </div>
      <div class="suggestion-card__label">修改后</div>
      <div class="suggestion-card__block suggestion-card__block--suggestion">
        <RenderSuggestion :text="item.suggestion" />
      </div>
    </div>
    <div class="suggestion-card__actions">
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
      <el-button
        type="danger"
        size="small"
        :disabled="disabled"
        @click="$emit('reject', msgIndex, modIdx)"
      >
        拒绝
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModificationItem } from '@/types/chat'
import RenderSuggestion from './RenderSuggestion.vue'
defineProps<{ item: ModificationItem; msgIndex: number; modIdx: number; disabled?: boolean }>()
defineEmits<{
  accept: [item: ModificationItem, msgIndex: number, modIdx: number]
  supplement: [item: ModificationItem, msgIndex: number, modIdx: number]
  reject: [msgIndex: number, modIdx: number]
}>()
</script>
