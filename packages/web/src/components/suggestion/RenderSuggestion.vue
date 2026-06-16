<template>
  <div class="suggestion-content" v-html="rendered" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderSafeMarkdown } from '@/lib/markdown'

const props = defineProps<{ text: string }>()

const rendered = computed(() => {
  return renderSafeMarkdown(props.text)
})
</script>

<style scoped>
.suggestion-content {
  /* 隔离全局样式，仅在此作用域内定义基础排版 */
  font-size: 0.7rem;
  line-height: 1.6;
  color: inherit;
  white-space: normal;
}
/* 重置 marked 可能被全局污染的样式 */
.suggestion-content :deep(p) {
  margin: 0.08em 0;
}
.suggestion-content :deep(p + p) {
  margin-top: 0.12em;
}
.suggestion-content :deep(ul),
.suggestion-content :deep(ol) {
  margin: 0.08em 0;
  padding-left: 1.2em;
}
.suggestion-content :deep(li) {
  margin: 0.04em 0;
}
.suggestion-content :deep(h1) {
  font-size: 1rem;
  font-weight: 700;
  margin: 0.28rem 0 0.12rem;
  line-height: 1.3;
}
.suggestion-content :deep(h2) {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0.24rem 0 0.1rem;
  line-height: 1.3;
}
.suggestion-content :deep(h3) {
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0.2rem 0 0.08rem;
  line-height: 1.3;
}
.suggestion-content :deep(h4) {
  font-size: 0.76rem;
  font-weight: 600;
  margin: 0.16rem 0 0.06rem;
  line-height: 1.3;
}
.suggestion-content :deep(h5) {
  font-size: 0.72rem;
  font-weight: 600;
  margin: 0.14rem 0 0.05rem;
  line-height: 1.3;
}
.suggestion-content :deep(h6) {
  font-size: 0.68rem;
  font-weight: 600;
  margin: 0.12rem 0 0.05rem;
  line-height: 1.3;
}
.suggestion-content :deep(strong) {
  font-weight: 600;
}
.suggestion-content :deep(code) {
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
}
.suggestion-content :deep(pre) {
  margin: 0.3em 0;
}
.suggestion-content :deep(pre code) {
  display: block;
  padding: 6px 8px;
  overflow-x: auto;
}
</style>
