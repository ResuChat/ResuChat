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
import { WarningFilled } from '@element-plus/icons-vue'
import { useSocket } from '@/composables/useWebSocket'
import { clearAuth } from '@/lib/auth'

const showRemoteDialog = ref(false)

function goToLogin() {
  clearAuth()
  window.location.href = '/'
}

onMounted(() => {
  const { on: wsOn } = useSocket()
  wsOn('remote_login', () => {
    showRemoteDialog.value = true
  })
})
</script>
