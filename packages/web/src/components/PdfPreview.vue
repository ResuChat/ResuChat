<template>
  <el-card class="preview-card">
    <template #header>
      <div class="preview-header">
        <span>简历预览</span>
        <div class="preview-actions">
          <span v-if="currentVersion" class="version-label">{{ currentVersion }}</span>
          <el-button size="small" @click="$emit('download')"> 下载 PDF </el-button>
        </div>
      </div>
    </template>
    <div class="preview-content">
      <el-empty v-if="loading" description="加载中..." />
      <el-result v-else-if="error" icon="error" :title="error" />
      <iframe v-else-if="pdfUrl" :src="pdfUrl" class="pdf-preview" />
      <el-empty v-else description="暂无简历文件" />
    </div>
    <div v-if="versions.length > 1" class="version-bar">
      <div class="version-chips">
        <div
          v-for="(v, idx) in versions"
          :key="v.refId"
          class="version-chip"
          :class="{ active: idx === activeIndex }"
          @click="$emit('select-version', idx)"
        >
          {{ v.type === 'original' ? '原始' : 'v' + v.version }}
        </div>
      </div>
      <div v-if="showRestore">
        <el-button
          type="warning"
          size="small"
          @click="$emit('restore', versions[activeIndex]?.refId)"
        >
          恢复到该版本
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { DocVersion } from '@/api'

defineProps<{
  pdfUrl: string
  loading: boolean
  error: string
  versions: DocVersion[]
  activeIndex: number
  currentVersion: string
  showRestore: boolean
}>()

defineEmits<{
  download: []
  'select-version': [index: number]
  restore: [refId: number]
}>()
</script>

<style scoped>
.preview-card {
  height: 100%;
}

.preview-card :deep(.el-card__body) {
  height: calc(100% - 55px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-label {
  font-size: 12px;
  color: #909399;
}

.preview-content {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.pdf-preview {
  width: 100%;
  height: 100%;
  border: none;
}

.version-bar-wrap {
  flex-shrink: 0;
}

.version-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0 0;
  border-top: 1px solid #eee;
}

.version-chips {
  display: flex;
  gap: 6px;
}

.version-chip {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  color: #666;
  background: #f0f0f0;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.version-chip:hover {
  background: #e0e0e0;
}

.version-chip.active {
  background: #409eff;
  color: #fff;
}
</style>
