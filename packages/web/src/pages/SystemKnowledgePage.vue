<template>
  <div class="app-page h-screen overflow-y-auto px-5 py-8 md:px-10 lg:px-16">
    <div class="app-page__inner max-w-[1180px]">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 class="m-0 text-xl font-semibold">系统知识库</h2>
          <p class="mt-1 text-sm text-(--text-muted)">
            维护公共知识分组，上传后由队列自动分类并向量化
          </p>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.docx,.txt,.md"
          class="hidden"
          @change="handleFileChange"
        />
      </div>

      <div class="knowledge-layout grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <SystemGroupTree
          :group-tree="groupTree"
          :groups-loading="groupsLoading"
          :selected-group-id="selectedGroupId"
          :group-active-changing-id="groupActiveChangingId"
          @select-group="handleGroupSelect"
          @create-root="createRootGroup"
          @refresh-all="refreshAll"
          @toggle-group-active="toggleGroupActive"
          @group-command="handleGroupCommand"
          @remove-group="removeGroup"
        />

        <main class="min-w-0">
          <div class="knowledge-toolbar mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-(--text-secondary)">
                {{ selectedGroup ? selectedGroup.name : '未选择分组' }}
              </div>
              <div class="mt-1 text-xs text-(--text-muted)">
                {{ visibleDocs.length }} 个文档
                <span v-if="selectedGroupDisabled"> · 分组已禁用</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <el-button :loading="loading" @click="refreshDocs">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
              <el-button
                type="primary"
                :loading="uploading"
                :disabled="!selectedGroup || selectedGroupDisabled"
                @click="fileInput?.click()"
              >
                <el-icon><Upload /></el-icon>
                上传到当前分组
              </el-button>
            </div>
          </div>

          <SystemDocumentTable
            :docs="visibleDocs"
            :loading="loading"
            :active-changing-id="activeChangingId"
            @toggle-active="toggleActive"
            @delete="handleDelete"
          />
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createSystemDocumentGroup,
  deleteSystemDocument,
  deleteSystemDocumentGroup,
  listSystemDocumentGroups,
  listSystemDocuments,
  updateSystemDocumentActive,
  updateSystemDocumentGroup,
  uploadSystemDocument
} from '@/api'
import { useSocket } from '@/composables/useWebSocket'
import { getErrorMessage } from '@/lib/errors'
import SystemGroupTree from '@/components/system-knowledge/SystemGroupTree.vue'
import SystemDocumentTable from '@/components/system-knowledge/SystemDocumentTable.vue'
import type { SystemDocumentGroup, SystemDocumentRecord } from '@/api'
import type { GroupNode } from '@/components/system-knowledge/SystemGroupTree.vue'

type GroupNode = SystemDocumentGroup & { children: GroupNode[]; disabled_by_ancestor: boolean }

const docs = ref<SystemDocumentRecord[]>([])
const groups = ref<SystemDocumentGroup[]>([])
const selectedGroupId = ref<number | null>(null)
const loading = ref(false)
const groupsLoading = ref(false)
const uploading = ref(false)
const activeChangingId = ref<number | null>(null)
const groupActiveChangingId = ref<number | null>(null)
const fileInput = ref<HTMLInputElement>()
let unsubSystemDocChanged: (() => void) | undefined
let unsubSystemKnowledgeChanged: (() => void) | undefined

const selectedGroup = computed(
  () => groups.value.find((group) => group.id === selectedGroupId.value) ?? null
)

const groupTree = computed<GroupNode[]>(() => {
  const map = new Map<number, GroupNode>()
  for (const group of groups.value) {
    map.set(group.id, { ...group, children: [], disabled_by_ancestor: false })
  }

  const roots: GroupNode[] = []
  for (const node of map.values()) {
    const parent = node.parent_id ? map.get(node.parent_id) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  markInheritedDisabled(roots)
  return roots
})

const groupNodeById = computed(() => {
  const map = new Map<number, GroupNode>()
  for (const root of groupTree.value) {
    collectGroupNodes(root, map)
  }
  return map
})

const selectedGroupNode = computed(() =>
  selectedGroupId.value === null ? null : (groupNodeById.value.get(selectedGroupId.value) ?? null)
)

const selectedGroupDisabled = computed(() => {
  const node = selectedGroupNode.value
  return !node || !node.active || node.disabled_by_ancestor
})

const visibleDocs = computed(() => {
  if (!selectedGroupId.value) return docs.value
  const ids = collectGroupIds(selectedGroupId.value)
  return docs.value.filter((doc) => doc.group_id !== null && ids.has(doc.group_id))
})

async function refreshAll() {
  await Promise.all([fetchGroups(), fetchDocs()])
}

async function fetchGroups() {
  groupsLoading.value = true
  try {
    const result = await listSystemDocumentGroups()
    groups.value = result.data || []
    if (
      (!selectedGroupId.value ||
        !groups.value.some((group) => group.id === selectedGroupId.value)) &&
      groups.value.length > 0
    ) {
      selectedGroupId.value = groups.value[0].id
    } else if (groups.value.length === 0) {
      selectedGroupId.value = null
    }
  } catch {
    ElMessage.error('获取系统知识库分组失败')
  } finally {
    groupsLoading.value = false
  }
}

async function fetchDocs() {
  loading.value = true
  try {
    const result = await listSystemDocuments()
    docs.value = result.data || []
  } catch {
    ElMessage.error('获取系统知识库失败')
  } finally {
    loading.value = false
  }
}

async function refreshDocs() {
  await fetchDocs()
}

function handleGroupSelect(data: SystemDocumentGroup) {
  selectedGroupId.value = data.id
}

async function createRootGroup() {
  await promptCreateGroup(null)
}

async function addChildGroup(parent: SystemDocumentGroup) {
  await promptCreateGroup(parent.id)
}

async function promptCreateGroup(parentId: number | null) {
  try {
    const { value } = await ElMessageBox.prompt('分组名称', '新建分组', {
      inputPattern: /\S+/,
      inputErrorMessage: '请填写分组名称'
    })
    const result = await createSystemDocumentGroup({ name: value.trim(), parentId })
    ElMessage.success('已创建分组')
    await fetchGroups()
    selectedGroupId.value = result.data.id
  } catch {
    /* user canceled */
  }
}

async function renameGroup(group: SystemDocumentGroup) {
  try {
    const { value } = await ElMessageBox.prompt('分组名称', '重命名分组', {
      inputValue: group.name,
      inputPattern: /\S+/,
      inputErrorMessage: '请填写分组名称'
    })
    await updateSystemDocumentGroup(group.id, { name: value.trim() })
    ElMessage.success('已重命名')
    await fetchGroups()
  } catch {
    /* user canceled */
  }
}

async function handleGroupCommand(command: string, group: SystemDocumentGroup) {
  if (command === 'add') {
    await addChildGroup(group)
    return
  }
  if (command === 'rename') {
    await renameGroup(group)
  }
}

async function removeGroup(group: SystemDocumentGroup) {
  try {
    await ElMessageBox.confirm(`确定删除分组「${group.name}」？`, '确认删除', { type: 'warning' })
  } catch {
    return
  }

  try {
    await deleteSystemDocumentGroup(group.id)
    ElMessage.success('已删除分组')
    if (selectedGroupId.value === group.id) selectedGroupId.value = null
    await fetchGroups()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '删除分组失败'))
  }
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!selectedGroup.value) {
    ElMessage.warning('请先选择分组')
    input.value = ''
    return
  }
  if (selectedGroupDisabled.value) {
    ElMessage.warning('当前分组已禁用')
    input.value = ''
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('groupId', String(selectedGroup.value.id))
    await uploadSystemDocument(formData)
    ElMessage.success('已加入向量化队列')
    await refreshAll()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '上传失败'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function toggleActive(row: SystemDocumentRecord) {
  activeChangingId.value = row.id
  try {
    await updateSystemDocumentActive(row.id, row.active)
  } catch {
    row.active = !row.active
    ElMessage.error('状态更新失败')
  } finally {
    activeChangingId.value = null
  }
}

async function toggleGroupActive(group: SystemDocumentGroup, active: boolean) {
  groupActiveChangingId.value = group.id
  try {
    await updateSystemDocumentGroup(group.id, { active })
    ElMessage.success(active ? '已启用分组' : '已禁用分组及下级')
    await refreshAll()
  } catch {
    ElMessage.error(active ? '父级禁用时不能启用子分组' : '分组状态更新失败')
    await fetchGroups()
  } finally {
    groupActiveChangingId.value = null
  }
}

async function handleDelete(row: SystemDocumentRecord) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.local_name}」？`, '确认删除', { type: 'warning' })
    await deleteSystemDocument(row.id)
    ElMessage.success('已删除')
    await refreshAll()
  } catch {
    /* empty */
  }
}

function collectGroupIds(rootId: number): Set<number> {
  const result = new Set<number>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const group of groups.value) {
      if (group.parent_id && result.has(group.parent_id) && !result.has(group.id)) {
        result.add(group.id)
        changed = true
      }
    }
  }
  return result
}

function collectGroupNodes(node: GroupNode, map: Map<number, GroupNode>) {
  map.set(node.id, node)
  for (const child of node.children) {
    collectGroupNodes(child, map)
  }
}

function markInheritedDisabled(nodes: GroupNode[], ancestorDisabled = false) {
  for (const node of nodes) {
    node.disabled_by_ancestor = ancestorDisabled
    markInheritedDisabled(node.children, ancestorDisabled || !node.active)
  }
}

onMounted(() => {
  void refreshAll()
  const { on: wsOn } = useSocket()
  unsubSystemDocChanged = wsOn('system_doc_index_changed', () => {
    void refreshAll()
  })
  unsubSystemKnowledgeChanged = wsOn('system_knowledge_changed', () => {
    void refreshAll()
  })
})
onUnmounted(() => {
  unsubSystemDocChanged?.()
  unsubSystemKnowledgeChanged?.()
})
</script>

<style scoped>
.knowledge-toolbar {
  background: transparent;
}
</style>
