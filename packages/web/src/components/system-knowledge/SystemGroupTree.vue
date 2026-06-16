<template>
  <aside class="group-pane min-h-[520px] rounded-[var(--radius-panel)]">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="text-sm font-semibold text-(--text-secondary)">分组</div>
      <div class="flex items-center gap-1">
        <el-button text size="small" class="icon-btn" @click="$emit('createRoot')">
          <el-icon><Plus /></el-icon>
        </el-button>
        <el-button text size="small" class="icon-btn" @click="$emit('refreshAll')">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <el-tree
      v-loading="groupsLoading"
      :data="groupTree"
      node-key="id"
      :props="{ label: 'name', children: 'children' }"
      :current-node-key="selectedGroupId"
      :expand-on-click-node="false"
      default-expand-all
      highlight-current
      empty-text="暂无分组"
      @node-click="(data) => $emit('selectGroup', data)"
    >
      <template #default="{ data }">
        <div
          class="group-node"
          :class="{ 'group-node--inactive': !data.active || data.disabled_by_ancestor }"
        >
          <span class="group-node__main">
            <span class="min-w-0 truncate">{{ data.name }}</span>
            <span class="group-node__count">{{ data.document_count }}</span>
          </span>
          <span class="group-node__switch" @click.stop @mousedown.stop>
            <el-switch
              size="small"
              :model-value="data.active"
              :loading="groupActiveChangingId === data.id"
              :disabled="data.disabled_by_ancestor || groupActiveChangingId !== null"
              @change="$emit('toggleGroupActive', data, Boolean($event))"
            />
          </span>
          <span class="group-node__actions" @click.stop @mousedown.stop>
            <el-dropdown
              trigger="click"
              placement="bottom-end"
              @click.stop
              @mousedown.stop
              @command="(command) => $emit('groupCommand', String(command), data)"
            >
              <el-button
                text
                size="small"
                class="icon-btn group-action-btn"
                @click.stop
                @mousedown.stop
              >
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="add">新增子分组</el-dropdown-item>
                  <el-dropdown-item command="rename">重命名</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button
              text
              size="small"
              class="icon-btn icon-btn--danger group-action-btn"
              @mousedown.stop
              @click.stop="$emit('removeGroup', data)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </span>
        </div>
      </template>
    </el-tree>
  </aside>
</template>

<script setup lang="ts">
import { Delete, MoreFilled, Plus, Refresh } from '@element-plus/icons-vue'
import type { SystemDocumentGroup } from '@resuchat/shared'

export type GroupNode = SystemDocumentGroup & {
  children: GroupNode[]
  disabled_by_ancestor: boolean
}

defineProps<{
  groupTree: GroupNode[]
  groupsLoading: boolean
  selectedGroupId: number | null
  groupActiveChangingId: number | null
}>()

defineEmits<{
  createRoot: []
  refreshAll: []
  selectGroup: [group: SystemDocumentGroup]
  toggleGroupActive: [group: SystemDocumentGroup, active: boolean]
  groupCommand: [command: string, group: SystemDocumentGroup]
  removeGroup: [group: SystemDocumentGroup]
}>()
</script>

<style scoped>
.group-pane {
  background: color-mix(in oklab, var(--bg) 88%, var(--pdf-bg) 12%);
  padding: 14px;
}

.group-node {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.group-node__main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 4px;
}

.group-node__count {
  flex: none;
  color: var(--text-muted);
  font-size: 12px;
}

.group-node__switch {
  display: inline-flex;
  flex: none;
  align-items: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.group-node__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.group-node:hover .group-node__switch,
.group-node:hover .group-node__actions {
  opacity: 1;
  pointer-events: auto;
}

.group-node--inactive .group-node__main {
  color: var(--text-muted);
}

.group-node--inactive .group-node__count {
  opacity: 0.72;
}

:deep(.el-tree) {
  --el-tree-node-hover-bg-color: color-mix(in oklab, var(--bg) 92%, var(--primary) 8%);
  color: var(--text-secondary);
  background: transparent;
}

:deep(.el-tree-node__content) {
  border-radius: 6px;
}

:deep(.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content) {
  color: var(--primary);
  background: color-mix(in oklab, var(--bg) 88%, var(--primary) 12%);
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

.group-action-btn.el-button {
  width: 22px;
  height: 22px;
  padding: 0;
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
