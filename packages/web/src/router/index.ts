import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/sidebar/AppLayout.vue'
import LoginPage from '@/pages/LoginPage.vue'
import NewChatPage from '@/pages/NewChatPage.vue'
import SearchConversationsPage from '@/pages/SearchConversationsPage.vue'
import EditorPage from '@/pages/EditorPage.vue'
import DocumentLibraryPage from '@/pages/DocumentLibraryPage.vue'
import SystemKnowledgePage from '@/pages/SystemKnowledgePage.vue'
import { isAuthenticated } from '@/lib/auth'
import { useUserStore } from '@/stores/user.store'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: LoginPage },
    {
      path: '/app',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/app/chat' },
        { path: 'chat', name: 'chat-new', component: NewChatPage },
        { path: 'chat/:id', name: 'chat', component: EditorPage },
        { path: 'conversations', name: 'conversations', component: SearchConversationsPage },
        { path: 'documents', name: 'documents', component: DocumentLibraryPage },
        {
          path: 'system-knowledge',
          name: 'system-knowledge',
          component: SystemKnowledgePage,
          meta: { requiresAdmin: true }
        }
      ]
    },
    { path: '/conversations', redirect: '/app/conversations' },
    { path: '/editor/:id', redirect: (to) => `/app/chat/${to.params.id}` },
    { path: '/editor', redirect: '/app/chat' }
  ]
})

router.beforeEach(async (to, _from, next) => {
  const authed = isAuthenticated()
  if (to.meta.requiresAuth && !authed) {
    next('/')
  } else if (to.path === '/' && authed) {
    next('/app/chat')
  } else if (to.meta.requiresAdmin) {
    const userStore = useUserStore()
    const profile = await userStore.fetchUserProfile(true).catch(() => null)
    if (profile?.role === 'admin') {
      next()
    } else {
      next('/app/chat')
    }
  } else {
    next()
  }
})

export default router
