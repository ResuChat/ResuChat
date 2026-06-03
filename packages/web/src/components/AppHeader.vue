<template>
  <header class="app-header">
    <div class="header-left">
      <span class="logo" @click="goToConversations">简历优化助手</span>
    </div>
    <div class="header-right">
      <span class="user-phone">{{ store.userInfo?.phone || '' }}</span>
      <el-button type="danger" size="small" @click="handleLogout"> 退出登录 </el-button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useResumeStore } from '@/stores/resume'
import { logout } from '@/api'

const router = useRouter()
const store = useResumeStore()

onMounted(() => {
  store.fetchUserProfile()
})

function goToConversations() {
  router.push('/conversations')
}

async function handleLogout() {
  try {
    await logout()
  } catch {
    // 即使服务端失败也清除本地
  }
  localStorage.removeItem('auth_token')
  localStorage.removeItem('login_phone')
  ElMessage.success('已退出登录')
  router.push('/')
}
</script>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 50px;
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  z-index: 1000;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.header-left .logo {
  font-size: 16px;
  font-weight: 600;
  color: #409eff;
  cursor: pointer;
}

.header-left .logo:hover {
  color: #66b1ff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-phone {
  font-size: 13px;
  color: #666;
}
</style>
