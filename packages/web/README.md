# @resuchat/web

ResuChat 前端，负责登录、会话创建、聊天交互、PDF 预览、文档引用和修改确认。

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

兼容跳转：

- `/conversations` -> `/app/conversations`
- `/editor/:id` -> `/app/chat/:id`
- `/editor` -> `/app/chat`

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

## 当前实现要点

- 新建对话和编辑页的主流程保留在页面层，不依赖超大 composable。
- 搜索请求不再向后端传整段 `messages`。
- 当用户仅附带文件或引用文档时，前端会兜底生成默认 `query`，保证后端搜索入参完整。
- `@` 引用文件确认后会清空输入中的 `@` 触发态，而不是残留在输入框。
- 用户消息气泡会显示本次发送携带的参考资料附件，附件数据来自后端持久化的 `messages.attachments`。
- 参考资料面板只由后端已绑定到会话的参考资料列表驱动，不对上传文件或从文档库引用文件做乐观更新。
- 从文档库引用参考资料时，面板优先显示用户文档名称 `local_name`，没有时回退会话引用名或原始文件名。
- 系统知识库页面仅管理员可见，支持分组管理、文档上传、启停和异步索引状态展示。

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
