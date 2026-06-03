<template>
  <div v-if="isAuthenticated" class="auth-layout">
    <AppHeader />
    <main class="main-content">
      <router-view />
    </main>
  </div>
  <router-view v-else />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'

const TOKEN_KEY = 'auth_token'
const isAuthenticated = ref(!!localStorage.getItem(TOKEN_KEY))

function checkAuth() {
  isAuthenticated.value = !!localStorage.getItem(TOKEN_KEY)
}

window.addEventListener('storage', checkAuth)
window.addEventListener('auth-change', checkAuth)
onMounted(() => checkAuth())
onUnmounted(() => {
  window.removeEventListener('storage', checkAuth)
  window.removeEventListener('auth-change', checkAuth)
})
</script>

<style>
.auth-layout {
  min-height: 100vh;
}

.main-content {
  padding-top: 50px;
}
</style>
