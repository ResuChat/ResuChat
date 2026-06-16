<template>
  <div class="app-page h-screen overflow-hidden px-5 py-8 md:px-10 lg:px-16">
    <div class="app-page__inner flex h-full max-w-[960px] flex-col">
      <div class="mb-5 flex-shrink-0">
        <h2 class="m-0 text-xl font-semibold">搜索对话</h2>
        <p class="mt-1 text-sm text-(--text-muted)">按标题或会话 ID 查找历史记录</p>
      </div>
      <div class="conversation-toolbar mb-4 flex-shrink-0">
        <el-input
          v-model="searchQuery"
          placeholder="搜索对话标题或 ID..."
          size="large"
          clearable
          :prefix-icon="Search"
          class="conversation-search-input"
        />
      </div>

      <div v-loading="loading" class="conversation-list min-h-0 flex-1 overflow-y-auto">
        <div v-if="filteredConversations.length === 0" class="py-16">
          <el-empty description="暂无对话" />
        </div>
        <div
          v-for="conv in filteredConversations"
          :key="conv.id"
          class="conversation-row flex items-center justify-between py-3.5 px-4 cursor-pointer transition-colors"
          @click="openConversation(conv.id)"
        >
          <div class="flex-1 min-w-0">
            <div class="truncate text-[15px] font-medium text-(--text)">
              {{ conv.title || '未命名对话' }}
            </div>
            <div class="mt-1 flex gap-3 text-xs text-(--text-muted)">
              <span>{{ formatTime(conv.updated_at) }}</span>
              <span>#{{ conv.id.slice(0, 16) }}...</span>
            </div>
          </div>
          <el-button
            text
            type="danger"
            size="small"
            class="delete-btn"
            @click.stop="handleDelete(conv.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>

      <div v-if="total > pageSize" class="flex flex-shrink-0 justify-center mt-5">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="fetchList"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Delete } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { getConversations, deleteConversation } from '@/api'
import { formatTime } from '@/lib/format'
import type { Conversation } from '@/api'

const router = useRouter()
const searchQuery = ref('')
const loading = ref(false)
const conversations = ref<Conversation[]>([])
const page = ref(1)
const pageSize = ref(50)
const total = ref(0)

const filteredConversations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return conversations.value
  return conversations.value.filter(
    (c) => (c.title || '').toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
  )
})

async function fetchList() {
  loading.value = true
  try {
    const result = await getConversations(page.value, pageSize.value)
    conversations.value = result.data
    total.value = result.pagination.total
  } finally {
    loading.value = false
  }
}

function openConversation(id: string) {
  router.push(`/app/chat/${id}`)
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定删除该对话？', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteConversation(id)
    conversations.value = conversations.value.filter((c) => c.id !== id)
  } catch {
    /* empty */
  }
}

onMounted(fetchList)
</script>

<style scoped>
.conversation-list {
  border-radius: var(--radius-panel);
  background: color-mix(in oklab, var(--bg) 86%, var(--pdf-bg) 14%);
}

.conversation-toolbar {
  background: transparent;
}

.conversation-search-input {
  max-width: 360px;
}

.conversation-row {
  border-bottom: 1px solid color-mix(in oklab, var(--border) 48%, transparent);
}

.conversation-row:last-child {
  border-bottom: 0;
}

.conversation-row:hover {
  background: color-mix(in oklab, var(--bg) 92%, var(--primary) 8%);
}

.delete-btn {
  opacity: 0.72;
  transition:
    opacity 0.18s,
    background-color 0.18s;
}

.conversation-row:hover .delete-btn,
.delete-btn:hover {
  opacity: 1;
}
</style>
