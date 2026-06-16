import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './style.css'
import App from './App.vue'
import router from './router'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')

// 覆盖 Element Plus 主题色（JS setProperty 优先于 CSS）
const root = document.documentElement
root.style.setProperty('--el-color-primary', '#00a6a6')
root.style.setProperty('--el-color-primary-light-3', '#00bfbf')
root.style.setProperty('--el-color-primary-light-5', 'rgba(0,166,166,0.3)')
root.style.setProperty('--el-color-primary-light-7', 'rgba(0,166,166,0.15)')
root.style.setProperty('--el-color-primary-light-8', 'rgba(0,166,166,0.08)')
root.style.setProperty('--el-color-primary-light-9', 'rgba(0,166,166,0.04)')
root.style.setProperty('--el-color-primary-dark-2', '#008787')
