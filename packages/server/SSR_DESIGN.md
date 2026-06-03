# SSR 渲染方案设计

## 一、背景与目标

### 当前架构

```
用户浏览器 → Vite Dev Server / 静态 SPA → axios → Express API Server (localhost:3000)
```

前端是纯客户端渲染（CSR），所有 HTML 由浏览器执行 JS 动态生成。

### SSR 的目标

| 目标 | 收益 |
| :--- | :--- |
| **首屏加载速度** | 服务器直接返回完整的 HTML，减少白屏时间 |
| **SEO** | 搜索引擎抓取到完整内容（对需要登录的简历工具非关键需求） |
| **首屏用户体验** | 减少 loading 状态闪烁 |

### 非目标

- 实时 AI 聊天流的 SSR（streamText SSE 仍是客户端行为）
- PDF 预览的 SSR（iframe 加载 PDF 文件，与 Vue 渲染无关）
- 离线/Service Worker

---

## 二、方案对比

### 方案 A：Vike（原 vite-plugin-ssr）

| 维度 | 说明 |
| :--- | :--- |
| 集成方式 | Vite 插件，+pages/ 目录约定 |
| 路由处理 | 文件系统路由，自动映射 |
| 与现有架构兼容性 | 需重构路由为 pages/ 目录结构 |
| Element Plus 兼容 | 需配置 `ssr: true` + 注入 `id` 属性 |
| Pinia 兼容 | 原生支持，`createPinia()` 服务端注入 |
| 学习成本 | 中 |
| 社区活跃度 | 高 |

### 方案 B：Nuxt 3

| 维度 | 说明 |
| :--- | :--- |
| 集成方式 | 全量替换 Vite + Vue Router，新项目结构 |
| 路由处理 | `pages/` 目录约定 |
| 与现有架构兼容性 | ❌ 需重写项目结构、路由配置、store、middleware |
| Element Plus 兼容 | 有现成 `nuxt-element-plus` 模块 |
| Pinia 兼容 | 原生支持 |
| 学习成本 | 高（nuxt.config、server/ 目录、auto-imports） |
| 迁移成本 | **极高** |

### 方案 C：Vue 原生 SSR + 集成到现有 Express

| 维度 | 说明 |
| :--- | :--- |
| 集成方式 | `@vue/server-renderer` + Vite SSR build，在现有 Express 中加 `renderToString()` handler |
| 路由处理 | Express catch-all 路由 + `vue-router` 服务端匹配 |
| 与现有架构兼容性 | 保持现有代码结构，Express 端口 3000 不变，不需新服务器 |
| Element Plus 兼容 | 需手动收集样式并注入 HTML |
| 学习成本 | 高（需理解 Vue SSR 全流程） |
| 迁移成本 | 低 |

### 方案 D：静态预渲染（Prerender）

| 维度 | 说明 |
| :--- | :--- |
| 集成方式 | Vite 构建后运行 `prerender-spa-plugin` 生成静态 HTML |
| 路由处理 | 预渲染指定路由 |
| 与现有架构兼容性 | 无需改代码，仅构建后处理 |
| 动态内容 | ❌ 只对静态路由有效，需要登录的动态页面无意义 |

**推荐：方案 A（Vike）**—— 低侵入、Vite 原生集成、社区成熟。以下方案按 Vike 设计。

---

## 三、Vike 集成方案

### 3.1 目录结构调整

```diff
 src/
-  pages/                    # 原有页面组件
-  router/index.ts           # 原有路由配置
+  pages/                    # 改为 Vike 的 pages 目录（文件系统路由）
+    index.page.vue          # / → LoginPage
+    login.page.vue          # /login
+    conversations.page.vue  # /conversations → ConversationsPage
+    editor/
+      [id].page.vue         # /editor/:id → EditorPage
+      index.page.vue        # /editor → EditorPage
+  renderer/                 # Vike SSR renderer
+    _default.page.server.vue
+    _default.page.client.vue
+    app.ts                  # createApp 工厂函数（SSR 兼容）
+    routes.ts               # 路由配置
```

### 3.2 关键文件

#### `renderer/app.ts` — 应用创建工厂

```typescript
import { createSSRApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import App from '../App.vue'
import { setSSRContext } from '../stores/resume'

export function createApp(pageContext: any) {
  const app = createSSRApp(App)

  // Pinia
  const pinia = createPinia()
  app.use(pinia)

  // Router
  const router = createRouter({
    history: import.meta.env.SSR ? createMemoryHistory() : createWebHistory(),
    routes: [], // 从 pages/ 文件系统路由自动生成，或手动配置
  })
  app.use(router)

  // Element Plus (SSR mode)
  app.use(ElementPlus, { ssr: true })

  return { app, router, pinia }
}
```

#### `renderer/_default.page.server.vue` — 服务端渲染入口

```vue
<template>
  <Teleport v-if="pageContext.injectElements" to="head">
    <component :is="'style'" v-html="pageContext.injectStyles" />
  </Teleport>
  <App />
</template>

<script setup lang="ts">
import App from '../App.vue'
const pageContext = (import.meta as any).pageContext
</script>
```

#### `renderer/_default.page.client.vue` — 客户端激活入口

```vue
<template>
  <App />
</template>

<script setup lang="ts">
import { useClientRouter } from 'vite-plugin-ssr/client/router'
import { createApp } from './app'

const app = createApp(pageContext)
app.mount('#app')
</script>
```

### 3.3 SSG / SSR Hybrid 配置

`vite.config.ts` 新增 Vike 插件：

```typescript
import vike from 'vike/plugin'

export default defineConfig({
  plugins: [
    vue(),
    vike(),       // SSR
    // ...
  ],
  ssr: {
    noExternal: ['element-plus', /element-plus\/.*/],
  },
})
```

### 3.4 依赖变更

```json
{
  "dependencies": {
    "vike": "^0.4.x",
    "@vite-plugin-ssr/vue": "^0.4.x",
    "vue": "^3.5.x"
  },
  "devDependencies": {
    "@types/connect-history-api-fallback": "^1.x"
  }
}
```

---

## 四、需处理的关键问题

### 4.1 Auth Token：localStorage → cookie

当前 `auth_token` 存储在 `localStorage` 中，**服务端没有 `localStorage`**。

**方案**：auth_token 从 `localStorage` 迁移到 `cookie`：

| 存储方式 | CSR | SSR 首屏 |
| :--- | :--- | :--- |
| localStorage | axios 拦截器读取 ✅ | 服务端无法读取 ❌ |
| cookie | axios 自动携带 ✅ | 服务端可读取 `req.headers.cookie` ✅ |

```typescript
// api/index.ts — 不再需要手动设置 token header
// axios 会自动携带 cookie

// 后端中间件 — 改为从 cookie 读取 token
const token = req.cookies?.auth_token || req.headers.token
```

### 4.2 Element Plus 样式注入

Element Plus 在 SSR 模式下需要服务端收集样式并注入 HTML：

```typescript
// renderer/_default.page.server.vue
import { renderToString } from '@vue/server-renderer'
import { collectStyleTag } from 'element-plus'

const appHtml = await renderToString(app)
const styleTag = collectStyleTag(app)
```

### 4.3 Pinia Store 状态序列化

服务端初始化 Pinia store 后，需要将状态序列化到 HTML 中供客户端激活：

```typescript
const pinia = createPinia()
app.use(pinia)

const store = useResumeStore()
// 根据请求 URL 预加载数据
if (pageContext.url.includes('/editor/')) {
  await store.loadConversation(pageContext.routeParams.id)
}

// 渲染后将 store 状态注入 HTML
const initialState = JSON.stringify(pinia.state.value)
// 注入到 HTML <script> window.__INITIAL_STATE__ = ${initialState}
```

客户端激活时恢复：

```typescript
// renderer/app.ts (client)
if (window.__INITIAL_STATE__) {
  pinia.state.value = window.__INITIAL_STATE__
}
```

### 4.4 编辑器页面（/editor/:id）的 SSR 策略

编辑器页面包含 AI 聊天、SSE 流、PDF iframe，**SSR 对这类交互密集型页面收益有限**。

**建议**：编辑器页面仍然 CSR（客户端渲染），仅在服务端返回 loading shell：

```typescript
// pages/editor/@id.page.server.ts
export async function onBeforeRender(pageContext: any) {
  // 只做基础数据预取，不渲染完整页面
  return {
    pageContext: {
      documentProps: { title: '简历编辑' },
    },
  }
}
```

后续交互完全由客户端处理。

### 4.5 路由守卫

当前使用 `router.beforeEach` 检查 `auth_token`。SSR 下需要**服务端路由守卫**：

```typescript
// renderer/_default.page.server.ts
export async function guard(pageContext: any) {
  const token = pageContext.cookies?.auth_token
  if (!token && pageContext.url !== '/login') {
    throw new Error('Redirect to /login')
  }
}
```

### 4.6 SSE / WebSocket

AI 聊天使用 `chat.sendMessage` + SSE 流，这完全是客户端行为，SSR 不参与也不影响。

---

## 五、部署架构

### 当前

```
Nginx → Vite SPA (端口 5173) + Express API (端口 3000)
```

### SSR 后

```
Nginx → Vike SSR Server (端口 3000)       # 渲染 Vue + 代理 API
          ├─ /api/* → Express API (3001)  # 后端 API
          └─ /* → SSR rendered HTML       # 前端页面
```

或一体化部署：

```
Nginx → Express Server (3000)
          ├─ SSR handler                  # Vike 渲染引擎
          ├─ /api/* → API routes          # 现有后端路由
          └─ /* → SSR rendered HTML       # 前端页面
```

一体化部署更简单，Express 既做 API 又做 SSR 渲染服务器：

```typescript
// src/index.ts（后端入口）
import { renderPage } from 'vike/server'

app.use('/api', apiRouter)  // 现有 API 路由

// SSR — 放在 API 路由之后
if (process.env.NODE_ENV === 'production') {
  app.get('*', async (req, res, next) => {
    const pageContextInit = {
      urlOriginal: req.originalUrl,
      cookies: req.cookies,
    }
    const pageContext = await renderPage(pageContextInit)
    if (pageContext.httpResponse) {
      const { body, statusCode, headers } = pageContext.httpResponse
      headers.forEach(([name, value]) => res.setHeader(name, value))
      res.status(statusCode).send(body)
    } else {
      next()
    }
  })
}
```

---

## 六、迁移步骤

| 步骤 | 内容 | 影响范围 |
| :--- | :--- | :--- |
| 1 | 安装 Vike 依赖 | `package.json` |
| 2 | 安装 `cookie-parser` 后端依赖 | 后端 `package.json` |
| 3 | 修改后端 auth 中间件支持 cookie | `auth/token.ts` |
| 4 | 创建 `renderer/` 目录 + 入口文件 | 新增 4~5 个文件 |
| 5 | 前端路由改为 `pages/` 文件系统路由 | `router/index.ts` 调整或删除 |
| 6 | Pinia store 添加 SSR 序列化支持 | `stores/resume.ts` |
| 7 | Element Plus 添加 SSR 配置 | `main.ts` / `renderer/app.ts` |
| 8 | 前端 `api/index.ts` 的 auth 拦截器改为 cookie | `api/index.ts` |
| 9 | 修改后端 `tsconfig.json` 支持 `jsx: "preserve"` | 后端配置 |
| 10 | 集成 SSR handler 到 Express | `src/index.ts` |

---

## 七、风险评估

| 风险 | 等级 | 缓解 |
| :--- | :--- | :--- |
| Element Plus SSR 兼容性问题 | 中 | 使用 `{ ssr: true }` 配置，升级到最新版本 |
| `localStorage` → cookie 迁移导致登录中断 | 高 | 先后端同时支持 header + cookie，过渡期后移除 header |
| SSR 服务器资源消耗（每请求渲染一次） | 中 | 对编辑器页面只用 CSR Loading Shell 降低开销 |
| Vike 版本迭代 API 变化 | 低 | 锁定 major 版本 |
| `document` / `window` 在 SSR 中不存在 | 中 | 所有 `if (import.meta.env.SSR)` 守卫第三方库调用 |
