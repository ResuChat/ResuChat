import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../pages/LoginPage.vue'
import ConversationsPage from '../pages/ConversationsPage.vue'
import EditorPage from '../pages/EditorPage.vue'

const TOKEN_KEY = 'auth_token'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: LoginPage },
    {
      path: '/conversations',
      name: 'conversations',
      component: ConversationsPage,
      meta: { requiresAuth: true }
    },
    { path: '/editor/:id', name: 'editor', component: EditorPage, meta: { requiresAuth: true } },
    { path: '/editor', name: 'editor-new', component: EditorPage, meta: { requiresAuth: true } }
  ]
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem(TOKEN_KEY)

  if (to.meta.requiresAuth && !token) {
    next('/')
  } else if (to.path === '/' && token) {
    next('/conversations')
  } else {
    next()
  }
})

export default router
