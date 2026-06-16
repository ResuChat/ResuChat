<template>
  <div class="knowledge-table-wrap overflow-hidden">
    <el-table
      v-loading="loading"
      stripe
      :data="docs"
      empty-text="当前分组暂无系统知识库文档"
      table-layout="fixed"
    >
      <el-table-column label="文档名称" min-width="220" fixed="left" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="text-[13px] font-medium text-(--text-secondary)">
            {{ row.local_name }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="内容类型" width="100">
        <template #default="{ row }">
          <el-tag :type="categoryTagType(row.category)" size="small">
            {{ categoryLabel(row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tooltip
            :disabled="!row.error_message"
            :content="row.error_message || ''"
            placement="top"
          >
            <el-tag :type="statusTagType(row.index_status)" size="small">
              {{ statusLabel(row.index_status) }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="分组" width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.group_name }}</template>
      </el-table-column>
      <el-table-column label="文件" width="90">
        <template #default="{ row }">
          <el-tag size="small">{{ fileTypeLabel(row.file_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="大小" width="100">
        <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
      </el-table-column>
      <el-table-column label="片段" width="80">
        <template #default="{ row }">{{ row.chunks_count }}</template>
      </el-table-column>
      <el-table-column label="启用" width="90">
        <template #default="{ row }">
          <el-switch
            v-model="row.active"
            :loading="activeChangingId === row.id"
            :disabled="row.index_status !== 'done'"
            @change="$emit('toggleActive', row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="160">
        <template #default="{ row }">
          <el-tooltip :content="new Date(row.updated_at).toLocaleString('zh-CN')" placement="top">
            <span>{{ formatRelative(row.updated_at) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right" align="center">
        <template #default="{ row }">
          <el-button
            text
            type="danger"
            size="small"
            class="icon-btn icon-btn--danger"
            @click="$emit('delete', row)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'
import { formatRelative } from '@/lib/format'
import { formatSize, fileTypeLabel } from '@/lib/file'
import { categoryLabel, categoryTagType, statusLabel, statusTagType } from '@/lib/system-knowledge'
import type { SystemDocumentRecord } from '@resuchat/shared'

defineProps<{
  docs: SystemDocumentRecord[]
  loading: boolean
  activeChangingId: number | null
}>()

defineEmits<{
  toggleActive: [row: SystemDocumentRecord]
  delete: [row: SystemDocumentRecord]
}>()
</script>

<style scoped>
.knowledge-table-wrap {
  background: color-mix(in oklab, var(--bg) 88%, var(--pdf-bg) 12%);
  border-radius: var(--radius-panel);
}

:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: transparent;
  --el-table-row-hover-bg-color: color-mix(in oklab, var(--bg) 92%, var(--primary) 8%);
  --el-table-border-color: color-mix(in oklab, var(--border) 46%, transparent);
  color: var(--text-secondary);
}

:deep(.el-table th.el-table__cell) {
  color: var(--text-muted);
  font-weight: 650;
  background: transparent;
}

:deep(.el-table .el-table__cell) {
  border-bottom-color: color-mix(in oklab, var(--border) 46%, transparent);
}

:deep(.el-table .el-table-fixed-column--left),
:deep(.el-table .el-table-fixed-column--right),
:deep(.el-table th.el-table-fixed-column--left),
:deep(.el-table th.el-table-fixed-column--right) {
  background: color-mix(in oklab, var(--bg) 88%, var(--pdf-bg) 12%);
}

:deep(.el-table__body tr.hover-row > td.el-table__cell),
:deep(.el-table__body tr:hover > td.el-table__cell) {
  background: color-mix(in oklab, var(--bg) 92%, var(--primary) 8%);
}

.icon-btn :deep(i) {
  color: var(--text-muted);
  transition:
    color 0.2s,
    transform 0.2s;
}

.icon-btn.el-button {
  --el-button-hover-bg-color: transparent;
  --el-button-active-bg-color: transparent;
  --el-button-hover-border-color: transparent;
  --el-button-active-border-color: transparent;
  background: transparent;
}

.icon-btn.el-button:hover,
.icon-btn.el-button:focus,
.icon-btn.el-button:active {
  background: transparent;
}

.icon-btn:hover :deep(i) {
  color: var(--primary);
  transform: scale(1.08);
}

.icon-btn--danger:hover :deep(i) {
  color: var(--el-color-danger);
}
</style>
