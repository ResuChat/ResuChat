<template>
  <div>
    <router-view />

    <!-- 异地登录提示 -->
    <el-dialog
      v-model="showRemoteDialog"
      title="安全提醒"
      width="480px"
      top="25vh"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <div class="flex flex-col items-center gap-4 py-4">
        <el-icon :size="48" color="var(--el-color-warning)">
          <WarningFilled />
        </el-icon>
        <p class="text-center text-sm text-(--text-secondary)">
          您的账号在其他设备登录，当前设备已下线。请重新登录。
        </p>
      </div>
      <template #footer>
        <el-button type="primary" @click="goToLogin"> 重新登录 </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { WarningFilled } from '@element-plus/icons-vue'
import { useSocket } from '@/composables/useWebSocket'
import { clearAuth } from '@/lib/auth'
import { useUserStore } from '@/stores/user.store'
import type { UserNotificationRecord, UserRole } from '@/types/api'

const showRemoteDialog = ref(false)
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

function goToLogin() {
  clearAuth()
  window.location.href = '/'
}

onMounted(() => {
  const { on: wsOn } = useSocket()
  wsOn('remote_login', () => {
    showRemoteDialog.value = true
  })
  wsOn('user_role_changed', (msg) => {
    const payload = getPayload(msg)
    const role = payload.role
    if (!isUserRole(role)) return
    userStore.updateRole(role)
    if (role !== 'admin' && route.name === 'system-knowledge') {
      router.push('/app/chat')
    }
  })
  wsOn('notification_created', (msg) => {
    const payload = getPayload(msg)
    const notification = payload.notification
    if (isNotification(notification)) userStore.prependNotification(notification)
  })
})

function getPayload(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== 'object') return {}
  const payload = (msg as { payload?: unknown }).payload
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'normal' || value === 'premium' || value === 'admin'
}

function isNotification(value: unknown): value is UserNotificationRecord {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw.id === 'number' &&
    typeof raw.type === 'string' &&
    typeof raw.title === 'string' &&
    typeof raw.content === 'string' &&
    (typeof raw.readAt === 'number' || raw.readAt === null) &&
    typeof raw.createdAt === 'number'
  )
}
</script>
