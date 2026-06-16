# @resuchat/web

ResuChat 前端，负责登录、会话创建、聊天交互、PDF 预览、文档引用和修改确认。

## 功能

| 功能 | 说明 |
| ---- | ---- |
| 对话式聊天 | 多轮 AI 对话，支持 Markdown 渲染和代码高亮 |
| 简历编辑 | 实时 PDF 预览，逐项采纳/拒绝 AI 修改建议 |
| 文档库 | 上传与管理简历和职位描述，跨会话复用 |
| 系统知识库 | 管理员维护分组文档，全局 RAG 增强 |
| 会话管理 | 历史会话检索、继续编辑、软删除与恢复 |
| 消息队列 | 操作串行提交，避免并发冲突 |

## 技术栈

- Vue 3.5
- Vite
- TypeScript
- Pinia
- Vue Router
- Element Plus
- Tailwind CSS v4
- pdfjs-dist
- `@ai-sdk/vue`

## 目录结构

```text
src/
  pages/
    LoginPage.vue
    NewChatPage.vue
    EditorPage.vue
    SearchConversationsPage.vue
    DocumentLibraryPage.vue
    SystemKnowledgePage.vue
  components/
    chat/
    editor/
    profile/
    sidebar/
    suggestion/
  composables/
    app/
    chat/
    editor/
  stores/
    chat.store.ts
    user.store.ts
  api/
    admin.ts
  lib/
  tests/
```

## 路由

| 路径                    | 页面                      | 说明                 |
| ----------------------- | ------------------------- | -------------------- |
| `/`                     | `LoginPage`               | 登录                 |
| `/app/chat`             | `NewChatPage`             | 新建对话             |
| `/app/chat/:id`         | `EditorPage`              | 编辑与聊天           |
| `/app/conversations`    | `SearchConversationsPage` | 历史会话             |
| `/app/documents`        | `DocumentLibraryPage`     | 文档库               |
| `/app/system-knowledge` | `SystemKnowledgePage`     | 系统知识库，仅管理员 |

## 关键组件

### `components/chat`

- `ChatPanel.vue`
- `ChatInput.vue`
- `ChatMessage.vue`
- `QueueIndicator.vue`
- `ReferenceDrawer.vue`
- `DocumentSearchPanel.vue`

### `components/editor`

- `PdfViewer.vue`
- `EditorSkeleton.vue`

### `components/suggestion`

- `OptimizationCard.vue`
- `ModificationReview.vue`
- `RenderSuggestion.vue`

### `components/sidebar`

- `AppLayout.vue`
- `AppSidebar.vue`

## Store

### `chat.store.ts`

管理：

- 当前会话 id
- 当前消息列表
- 会话列表
- 文档列表
- 引用文件
- 版本信息
- 当前 PDF blob URL
- `initialPrompt`

### `user.store.ts`

管理当前用户信息和登录态相关数据。

## 开发命令

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:run
pnpm lint
pnpm format
pnpm exec vue-tsc --noEmit
```

## 测试

前端测试已按主题拆分：

- `auth-and-types.test.ts`
- `chat-behavior.test.ts`
- `chat-page-helpers.test.ts`
- `conversation-loader.test.ts`
- `routing-and-queue.test.ts`
- `store-and-api.test.ts`

## 运行说明

开发环境下 Vite 会把 API、头像和 WebSocket 相关请求转发到后端服务。

## 许可

AGPL-3.0-only. 详见项目根目录 [LICENSE](../../LICENSE)。
