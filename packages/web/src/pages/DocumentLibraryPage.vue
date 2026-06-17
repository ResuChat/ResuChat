<template>
  <div class="app-page h-screen overflow-y-auto px-5 py-8 md:px-10 lg:px-16">
    <div class="app-page__inner max-w-[1040px]">
      <div class="flex justify-between items-center mb-5">
        <div>
          <h2 class="m-0 text-xl font-semibold">文档库</h2>
          <p class="mt-1 text-sm text-(--text-muted)">管理简历、JD 和参考资料</p>
        </div>
        <div class="flex gap-2">
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.docx,.txt,.md"
            class="hidden"
            @change="handleFileChange"
          />
          <el-button type="primary" :loading="uploading" @click="fileInput?.click()">
            <el-icon><Upload /></el-icon> 上传文档
          </el-button>
        </div>
      </div>

      <div class="library-toolbar mb-4 flex justify-between items-center gap-3">
        <el-input
          v-model="search"
          placeholder="搜索文档名称..."
          clearable
          class="doc-search-input"
          @input="onSearchInput"
          @clear="onSearchClear"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-radio-group v-model="fileType" class="shrink-0" @change="onFilterChange">
          <el-radio-button value=""> 全部 </el-radio-button>
          <el-radio-button value="docx"> DOC </el-radio-button>
          <el-radio-button value="pdf"> PDF </el-radio-button>
          <el-radio-button value="txt"> TXT </el-radio-button>
        </el-radio-group>
      </div>

      <div class="library-table-wrap overflow-hidden">
        <el-table
          :key="page"
          v-loading="loading"
          stripe
          :data="docs"
          empty-text="暂无文档"
          table-layout="fixed"
        >
          <el-table-column label="文档名称" width="220" fixed="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span
                v-if="renamingId !== row.id"
                class="cursor-pointer hover:text-(--primary)"
                @click="startRename(row)"
                >{{ stripExt(row.localName) }}</span
              >
              <el-input
                v-else
                v-model="renameText"
                size="small"
                @keydown.enter="confirmRename(row)"
                @blur="confirmRename(row)"
                @keydown.escape="renamingId = null"
              />
            </template>
          </el-table-column>
          <el-table-column label="原始文件" width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span
                class="cursor-pointer text-[13px] text-(--primary) hover:underline"
                @click="downloadDoc(row)"
                >{{ row.originalName }}</span
              >
            </template>
          </el-table-column>
          <el-table-column label="来源" width="100">
            <template #default="{ row }">
              <el-tag :type="row.source === 'conversation' ? 'primary' : 'success'" size="small">
                {{ row.source === 'conversation' ? '会话' : '上传' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="内容类型" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.contentCategory === 'resume'" type="success" size="small">
                简历
              </el-tag>
              <el-tag v-else-if="row.contentCategory === 'job'" size="small"> 岗位 </el-tag>
              <el-tag v-else-if="row.contentCategory === 'unknown'" type="info" size="small">
                其他
              </el-tag>
              <span v-else class="text-xs text-(--text-muted)">-</span>
            </template>
          </el-table-column>
          <el-table-column label="解析" width="120">
            <template #default="{ row }">
              <el-tag :type="parseTagType(row)" size="small">
                <el-icon
                  v-if="row.parseStatus === 'parsing'"
                  class="animate-spin cursor-pointer"
                  title="取消解析"
                  @click="cancelParse(row)"
                >
                  <Loading />
                </el-icon>
                {{ parseTagText(row) }}
                <el-icon
                  v-if="canRetry(row)"
                  class="ml-0.5 cursor-pointer"
                  :size="12"
                  title="重新解析"
                  @click="retryParse(row)"
                >
                  <Refresh />
                </el-icon>
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="80">
            <template #default="{ row }">
              <el-tag size="small">
                {{ fileTypeLabel(row.fileType) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="大小" width="100">
            <template #default="{ row }">
              {{ formatSize(row.fileSize) }}
            </template>
          </el-table-column>
          <el-table-column label="入库时间" width="160">
            <template #default="{ row }">
              <el-tooltip
                :content="new Date(row.createdAt).toLocaleString('zh-CN')"
                placement="top"
              >
                <span>{{ formatRelative(row.createdAt) }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <el-button text size="small" class="icon-btn" @click="downloadDoc(row)">
                <el-icon><Download /></el-icon>
              </el-button>
              <el-button
                text
                type="danger"
                size="small"
                class="icon-btn icon-btn--danger"
                @click="handleDelete(row)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="total > pageSize" class="flex justify-center mt-4">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="fetchDocs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Search, Delete, Download, Upload, Loading, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/client'
import { formatRelative } from '@/lib/format'
import { formatSize, fileTypeLabel } from '@/lib/file'
import { getErrorMessage } from '@/lib/errors'
import { downloadBlob } from '@/lib/download'
import { useSocket } from '@/composables/useWebSocket'
import { type AxiosError } from 'axios'

interface DocRecord {
  id: number
  globalDocId: number
  localName: string
  originalName: string
  fileType: string
  fileSize: number
  source: string
  parseStatus: string
  contentCategory: string | null
  createdAt: number
}

const docs = ref<DocRecord[]>([])
const loading = ref(false)
const search = ref('')
const fileType = ref('')
const page = ref(1)
const pageSize = 10
const total = ref(0)
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const renamingId = ref<number | null>(null)
const renameText = ref('')
const fetchDocsDebounced = useDebounceFn(fetchDocs, 300)

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    await api.post('/user-documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    ElMessage.success('上传成功')
    fetchDocs()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '上传失败'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

async function downloadDoc(row: DocRecord) {
  try {
    const res = await api.get(`/user-documents/${row.id}/download`, { responseType: 'blob' })
    downloadBlob(res as unknown as Blob, row.originalName)
  } catch {
    ElMessage.error('下载失败')
  }
}

function parseTagType(row: DocRecord): string {
  if (row.parseStatus === 'done') return 'success'
  if (row.parseStatus === 'parsing') return 'warning'
  if (row.parseStatus === 'failed') return 'danger'
  return 'info'
}
function parseTagText(row: DocRecord): string {
  if (row.parseStatus === 'done') return '已解析'
  if (row.parseStatus === 'parsing') return ' 解析中'
  if (row.parseStatus === 'failed') return '失败'
  return '待解析'
}

// 只有简历类型失败或待解析的文档才能重新解析
function canRetry(row: DocRecord): boolean {
  return (
    (row.parseStatus === 'failed' || row.parseStatus === 'pending') &&
    (!row.contentCategory || row.contentCategory === 'resume')
  )
}

async function fetchDocs() {
  loading.value = true
  try {
    const params: Record<string, unknown> = { page: page.value, pageSize }
    if (search.value.trim()) params.search = search.value.trim()
    if (fileType.value) params.fileType = fileType.value
    const res = (await api.get('/user-documents', { params })) as {
      data: DocRecord[]
      pagination: { total: number }
    }
    docs.value = res.data || []
    total.value = res.pagination?.total || 0
  } catch {
    ElMessage.error('获取文档列表失败')
  } finally {
    loading.value = false
  }
}

function onSearchInput() {
  page.value = 1
  fetchDocsDebounced()
}

function onSearchClear() {
  search.value = ''
  page.value = 1
  fetchDocs()
}

function onFilterChange() {
  page.value = 1
  fetchDocs()
}

function startRename(row: DocRecord) {
  renamingId.value = row.id
  renameText.value = row.localName
}

async function confirmRename(row: DocRecord) {
  if (renamingId.value !== row.id) return
  renamingId.value = null
  const newName = renameText.value.trim()
  if (!newName || newName === row.localName) return
  try {
    await api.patch(`/user-documents/${row.id}`, { localName: newName })
    row.localName = newName
    ElMessage.success('已重命名')
  } catch {
    ElMessage.error('重命名失败')
  }
}

async function retryParse(row: DocRecord) {
  try {
    row.parseStatus = 'parsing'
    await api.post(`/user-documents/${row.id}/retry-parse`)
    ElMessage.success('已提交重新解析')
  } catch (e) {
    row.parseStatus = 'failed'
    ElMessage.warning(
      (e as AxiosError<Record<string, unknown> & { error: string }>).response?.data?.error ||
        '重试失败'
    )
  }
}

async function cancelParse(row: DocRecord) {
  try {
    await api.post(`/user-documents/${row.id}/cancel-parse`)
    row.parseStatus = 'failed'
    ElMessage.info('已取消解析')
  } catch {
    ElMessage.error('取消失败')
  }
}

async function handleDelete(row: DocRecord) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.localName}」？`, '确认删除', { type: 'warning' })
    await api.delete(`/user-documents/${row.id}`)
    ElMessage.success('已删除')
    fetchDocs()
  } catch {
    /* empty */
  }
}

let unsubDone: (() => void) | undefined
let unsubFailed: (() => void) | undefined

onMounted(() => {
  fetchDocs()
  const { on: wsOn } = useSocket()
  unsubDone = wsOn('doc_parse_done', () => {
    fetchDocs()
  })
  unsubFailed = wsOn('doc_parse_failed', () => {
    fetchDocs()
  })
})

onUnmounted(() => {
  unsubDone?.()
  unsubFailed?.()
})
</script>
<style scoped>
.library-table-wrap {
  border-radius: var(--radius-panel);
  background: color-mix(in oklab, var(--bg) 86%, var(--pdf-bg) 14%);
}

.library-toolbar {
  background: transparent;
}

.doc-search-input {
  width: min(280px, 42vw);
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
  background: color-mix(in oklab, var(--bg) 86%, var(--pdf-bg) 14%);
}

:deep(.el-table__body tr.hover-row > td.el-table__cell),
:deep(.el-table__body tr:hover > td.el-table__cell) {
  background: color-mix(in oklab, var(--bg) 92%, var(--primary) 8%);
}

:deep(.el-table__body tr.hover-row > td.el-table-fixed-column--left),
:deep(.el-table__body tr.hover-row > td.el-table-fixed-column--right),
:deep(.el-table__body tr:hover > .el-table-fixed-column--left),
:deep(.el-table__body tr:hover > .el-table-fixed-column--right) {
  background: color-mix(in oklab, var(--bg) 92%, var(--primary) 8%);
}

:deep(.el-radio-button__inner) {
  border-color: color-mix(in oklab, var(--border) 86%, transparent);
  background: transparent;
  color: var(--text-secondary);
  transition:
    border-color 0.18s,
    color 0.18s,
    background-color 0.18s;
}

:deep(.el-radio-button__inner:hover) {
  border-color: var(--primary);
  color: var(--primary);
}

:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary-bg) 78%, transparent);
  color: var(--primary);
  box-shadow: -1px 0 0 0 var(--primary);
}

.icon-btn :deep(i) {
  color: var(--primary);
  transition:
    color 0.2s,
    transform 0.2s;
}

.icon-btn--danger :deep(i) {
  color: var(--el-color-danger);
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
  color: var(--primary-dark);
  transform: scale(1.08);
}

.icon-btn--danger:hover :deep(i) {
  color: var(--el-color-danger);
  transform: scale(1.08);
}
</style>
