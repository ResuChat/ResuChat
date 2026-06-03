<template>
  <el-drawer v-model="drawerVisible" title="会话历史" direction="ltr" size="320px">
    <div class="drawer-content">
      <div v-if="store.conversationsLoading" class="loading-wrap">
        <el-icon class="is-loading">
          <Loading />
        </el-icon>
        <span>加载中...</span>
      </div>
      <el-empty v-else-if="store.conversations.length === 0" description="暂无会话" />
      <div v-else class="conversation-list">
        <div
          v-for="conv in store.conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === activeId }"
          @click="selectConversation(conv.id)"
        >
          <div class="conv-title">
            {{ conv.title || '无标题会话' }}
          </div>
          <div class="conv-time">
            {{ formatTime(conv.updated_at) }}
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Loading } from '@element-plus/icons-vue'
import { useResumeStore } from '@/stores/resume'
import { formatTime } from '@/lib/format'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const router = useRouter()
const store = useResumeStore()

const drawerVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const activeId = computed(() => store.conversationId)

let lastFetchTime = 0

watch(
  () => props.visible,
  (val) => {
    if (val && Date.now() - lastFetchTime > 30000) {
      lastFetchTime = Date.now()
      store.fetchConversations(1, 50)
    }
  }
)

function selectConversation(id: string) {
  drawerVisible.value = false
  router.push(`/editor/${id}`)
}
</script>

<style scoped>
.drawer-content {
  padding: 0 8px;
}

.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #909399;
  gap: 8px;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conv-item {
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.conv-item:hover {
  background: #f5f7fa;
}

.conv-item.active {
  background: #ecf5ff;
  border-left: 3px solid #409eff;
}

.conv-title {
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-time {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
</style>
