<template>
  <aside
    class="flex h-screen flex-col border-r border-(--sidebar-border) bg-(--sidebar-bg) text-(--sidebar-text) transition-[width,min-width] duration-200 ease-in-out"
    :style="collapsed ? 'width:60px;min-width:60px' : 'width:260px;min-width:260px'"
  >
    <div
      class="flex items-center gap-2"
      :class="collapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-2.5 py-3'"
    >
      <div
        class="flex items-center gap-2 cursor-pointer whitespace-nowrap overflow-hidden"
        :class="collapsed ? 'flex-none' : 'flex-1'"
        @click="collapsed ? (collapsed = false) : $router.push('/app/chat')"
      >
        <span class="text-[22px] flex-shrink-0">📄</span>
        <span v-show="!collapsed" class="text-[15px] font-semibold">聊简历</span>
      </div>
      <div
        v-show="!collapsed"
        class="sidebar-action w-7 h-7 rounded-md flex items-center justify-center cursor-pointer flex-shrink-0"
        @click="collapsed = true"
      >
        <el-icon :size="16">
          <Fold />
        </el-icon>
      </div>
    </div>

    <nav class="flex flex-col gap-0.5 px-1.5 py-1">
      <router-link
        to="/app/chat"
        class="flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2.5 text-sm no-underline transition-colors hover:bg-(--sidebar-hover)"
        :class="collapsed ? 'justify-center' : ''"
        :title="collapsed ? '新对话' : ''"
        active-class="!bg-(--sidebar-active) font-medium"
      >
        <el-icon><Plus /></el-icon>
        <span v-show="!collapsed">新对话</span>
      </router-link>
      <router-link
        to="/app/conversations"
        class="flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2.5 text-sm no-underline transition-colors hover:bg-(--sidebar-hover)"
        :class="collapsed ? 'justify-center' : ''"
        :title="collapsed ? '搜索对话' : ''"
        active-class="!bg-(--sidebar-active) font-medium"
      >
        <el-icon><ChatDotRound /></el-icon>
        <span v-show="!collapsed">搜索对话</span>
      </router-link>
      <router-link
        to="/app/documents"
        class="flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2.5 text-sm no-underline transition-colors hover:bg-(--sidebar-hover)"
        :class="collapsed ? 'justify-center' : ''"
        :title="collapsed ? '文档库' : ''"
        active-class="!bg-(--sidebar-active) font-medium"
      >
        <el-icon><Folder /></el-icon>
        <span v-show="!collapsed">文档库</span>
      </router-link>
      <router-link
        v-if="isAdmin"
        to="/app/system-knowledge"
        class="flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2.5 text-sm no-underline transition-colors hover:bg-(--sidebar-hover)"
        :class="collapsed ? 'justify-center' : ''"
        :title="collapsed ? '系统知识库' : ''"
        active-class="!bg-(--sidebar-active) font-medium"
      >
        <el-icon><Setting /></el-icon>
        <span v-show="!collapsed">系统知识库</span>
      </router-link>
    </nav>

    <div v-show="!collapsed" class="flex-1 flex flex-col min-h-0 px-1.5">
      <div class="flex justify-between items-center py-2 px-1 text-xs font-medium">
        <span class="text-sm">历史对话</span>
        <span
          class="flex cursor-pointer items-center rounded p-1 transition-colors hover:bg-(--sidebar-hover)"
          :class="{ 'animate-spin': loading }"
          @click="refreshList"
        >
          <el-icon :size="16"><Refresh /></el-icon>
        </span>
      </div>
      <el-scrollbar class="flex-1">
        <div
          v-if="conversations.length === 0"
          class="py-5 text-center text-[13px] text-(--text-muted)"
        >
          暂无对话
        </div>
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="group relative mb-0.5 cursor-pointer rounded-lg px-2.5 py-2 transition-colors hover:bg-(--sidebar-hover)"
          :class="{ '!bg-(--sidebar-active)': currentConvId === conv.id }"
          @click="$router.push(`/app/chat/${conv.id}`)"
        >
          <div class="text-[13px] whitespace-nowrap overflow-hidden text-ellipsis pr-6">
            {{ conv.title || '未命名对话' }}
          </div>
          <div class="mt-0.5 text-[11px] text-(--sidebar-text-secondary)">
            {{ formatTime(conv.updated_at) }}
          </div>
          <span
            class="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 pointer-events-auto"
          >
            <el-popconfirm
              title="确定删除该对话？"
              confirm-button-text="删除"
              cancel-button-text="取消"
              :hide-icon="true"
              width="180"
              @confirm="handleDelete(conv.id)"
              @click.stop
            >
              <template #reference>
                <span
                  class="flex cursor-pointer rounded px-1 py-0.5 text-sm text-(--text-muted) hover:bg-(--sidebar-active) hover:text-(--text-secondary)"
                  title="删除对话"
                  @click.stop
                >
                  <el-icon><Delete /></el-icon>
                </span>
              </template>
            </el-popconfirm>
          </span>
        </div>
      </el-scrollbar>
    </div>

    <div
      class="mt-auto flex items-center gap-1 border-t border-(--sidebar-border) p-2"
      :class="collapsed ? 'flex-col justify-center' : 'justify-between'"
    >
      <div
        class="sidebar-action w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
        :title="theme.isDark.value ? '切换日间模式' : '切换夜间模式'"
        @click="theme.toggle()"
      >
        <el-icon :size="18"> <Sunny v-if="theme.isDark.value" /><Moon v-else /> </el-icon>
      </div>
      <div class="flex items-center gap-1" :class="collapsed ? 'flex-col' : ''">
        <el-popover trigger="click" placement="right-end" width="320" @show="loadNotifications">
          <template #reference>
            <div
              class="sidebar-action relative w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
              title="站内信"
            >
              <el-icon :size="18"><Bell /></el-icon>
              <span
                v-if="userStore.unreadNotificationCount > 0"
                class="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 text-white"
              >
                {{ unreadBadge }}
              </span>
            </div>
          </template>
          <div class="notification-panel">
            <div class="notification-panel__header">
              <span>站内信</span>
              <button
                class="notification-panel__action"
                :disabled="userStore.unreadNotificationCount === 0"
                @click="markAllNotificationsRead"
              >
                全部已读
              </button>
            </div>
            <div v-if="userStore.notifications.length === 0" class="notification-panel__empty">
              暂无消息
            </div>
            <div v-else class="notification-panel__list">
              <button
                v-for="item in userStore.notifications"
                :key="item.id"
                class="notification-panel__item"
                :class="{ 'notification-panel__item--unread': item.readAt === null }"
                @click="markNotificationRead(item.id)"
              >
                <span class="notification-panel__title">{{ item.title }}</span>
                <span class="notification-panel__content">{{ item.content }}</span>
                <span class="notification-panel__time">{{ formatTime(item.createdAt) }}</span>
              </button>
            </div>
          </div>
        </el-popover>
        <el-dropdown trigger="click" placement="right-end">
          <div
            class="sidebar-user w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            :title="displayName"
          >
            <img
              v-if="userStore.userInfo?.avatar"
              :src="userStore.userInfo.avatar"
              class="h-6 w-6 rounded-full object-cover"
            />
            <div
              v-else
              class="flex h-6 w-6 items-center justify-center rounded-full bg-(--primary) text-[11px] text-white"
            >
              {{ displayName.charAt(0).toUpperCase() }}
            </div>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                <div class="user-menu-header">
                  <span class="user-menu-header__name">{{ displayName }}</span>
                  <span class="user-menu-header__meta">
                    {{ userStore.userInfo?.phone || '未登录' }}
                  </span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item @click="showProfileDialog = true">
                <el-icon><Edit /></el-icon> 编辑资料
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">
                <el-icon><SwitchButton /></el-icon> 退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <ProfileDialog v-model:visible="showProfileDialog" />
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useStorage } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import {
  Fold,
  Plus,
  ChatDotRound,
  Folder,
  Setting,
  Refresh,
  Delete,
  Edit,
  SwitchButton,
  Sunny,
  Moon,
  Bell
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat.store'
import { useUserStore } from '@/stores/user.store'
import { deleteConversation } from '@/api/conversation'
import { logout } from '@/api/user'
import ProfileDialog from '@/components/profile/ProfileDialog.vue'
import { formatTime } from '@/lib/format'
import { useTheme } from '@/composables/app/useTheme'
import { clearAuth } from '@/lib/auth'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const userStore = useUserStore()
const theme = useTheme()
const loading = ref(false)
const collapsed = useStorage('sidebar_collapsed', false)
const conversations = computed(() => chatStore.conversations)
const currentConvId = computed(() => (route.params.id as string) || '')
const displayName = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.phone || '未登录'
)
const isAdmin = computed(() => userStore.userInfo?.role === 'admin')
const showProfileDialog = ref(false)
const unreadBadge = computed(() =>
  userStore.unreadNotificationCount > 99 ? '99+' : String(userStore.unreadNotificationCount)
)

async function refreshList() {
  loading.value = true
  await chatStore.fetchConversations(1, 50)
  loading.value = false
  ElMessage.success('刷新成功')
}
async function handleDelete(id: string) {
  await deleteConversation(id)
  chatStore.conversations = chatStore.conversations.filter((c) => c.id !== id)
  if (currentConvId.value === id) router.push('/app/chat')
}
async function handleLogout() {
  await logout()
  clearAuth()
  router.push('/')
}
async function loadNotifications() {
  await userStore.fetchNotifications().catch(() => undefined)
}
async function markNotificationRead(id: number) {
  await userStore.markNotificationRead(id).catch(() => undefined)
}
async function markAllNotificationsRead() {
  await userStore.markNotificationsReadAll().catch(() => undefined)
}
onMounted(() => {
  chatStore.fetchConversations(1, 50)
  userStore.fetchUserProfile(true).catch(() => undefined)
  userStore.fetchNotifications().catch(() => undefined)
})
</script>

<style scoped>
.sidebar-action,
.sidebar-user {
  color: var(--sidebar-text-secondary);
  transition:
    background-color 0.18s,
    color 0.18s;
}

.sidebar-action:hover,
.sidebar-user:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text);
}

.notification-panel {
  display: flex;
  max-height: 360px;
  flex-direction: column;
}

.notification-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.notification-panel__action {
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 12px;
}

.notification-panel__action:disabled {
  color: var(--el-text-color-disabled);
  cursor: default;
}

.notification-panel__empty {
  padding: 24px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.notification-panel__list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-top: 6px;
}

.notification-panel__item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.notification-panel__item:hover {
  background: var(--el-fill-color-light);
}

.notification-panel__item--unread {
  background: var(--el-color-primary-light-9);
}

.notification-panel__title {
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.notification-panel__content {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.4;
}

.notification-panel__time {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.user-menu-header {
  display: flex;
  min-width: 150px;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.user-menu-header__name {
  max-width: 220px;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-header__meta {
  max-width: 220px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
