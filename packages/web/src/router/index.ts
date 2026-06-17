import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/sidebar/AppLayout.vue'
import LoginPage from '@/pages/LoginPage.vue'
import { isAuthenticated } from '@/lib/auth'
import { useUserStore } from '@/stores/user.store'

const NewChatPage = () => import('@/pages/NewChatPage.vue')
const SearchConversationsPage = () => import('@/pages/SearchConversationsPage.vue')
const EditorPage = () => import('@/pages/EditorPage.vue')
const DocumentLibraryPage = () => import('@/pages/DocumentLibraryPage.vue')
const SystemKnowledgePage = () => import('@/pages/SystemKnowledgePage.vue')

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
    }
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
