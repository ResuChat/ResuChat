# aiagentfe-vue

Vue 3 + Vite + TypeScript + Element Plus + Tailwind CSS v4 + marked

## 操作指引

- **优先使用 MCP 服务** 进行文件读写、搜索、网页抓取等操作

## Commands

```
npm run dev       # Vite dev server
npm run build     # vue-tsc --noEmit && vite build
npm run test      # vitest watch
npm run test:run  # vitest once (CI)
npm run lint      # ESLint check
npm run format    # Prettier format
```

## Architecture

- Vue 3 Composition API + Pinia state
- Vue Router with `createWebHistory()`, auth guard via `localStorage.login_phone`
- Axios base `/api`, proxied to `http://localhost:3000`
- Path alias `@/` → `src/`
- ESLint v9 flat config

## Routes

| Path | Component | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/` | `LoginPage` | No | Phone + captcha login |
| `/conversations` | `ConversationsPage` | Yes | History list + upload |
| `/editor/:id` | `EditorPage` | Yes | Resume editor + chat |
| `/editor` | `EditorPage` | Yes | New conversation |

## Key Components

| Component | Purpose |
| :--- | :--- |
| `AppHeader` | Top bar: title, user, logout |
| `ConversationDrawer` | Sidebar: conversation list |
| `PdfPreview` | PDF preview + download |
| `ChatPanel` | Messages + input + file + error + queue panel |
| `OptimizationCard` | Suggestion card (updateResume) |
| `ModificationReview` | Modification preview (proposeModification) |

## State (`src/stores/resume.ts`)

- `fileName`, `conversationId`, `messages`, `documents`, `conversations`
- `loadConversation(id)` — fetches messages + docs + initialPrompt
- `fetchUserProfile()`, `fetchConversations()`

## Auth

- `localStorage.auth_token` + `localStorage.login_phone`
- Interceptor attaches `token` + `X-Phone`
- 401 → clear + redirect to `/`

## Core Features

- **Conversation Flow**: Upload resume → `POST /rag/start` → simulated progress (指数衰减曲线, 6阶段) → redirect to editor
- **RAG Chat**: SSE streaming via `@ai-sdk/vue (new Chat)` → tool results parsed into cards
- **Message Queue**: Serial execution via `enqueueRequest`/`processQueue`, dedup, drag reorder, cancel/cancelAll
- **Stop Button**: 发送+停止按钮共存（`v-if="isSearchProcessing"`），仅 search 流式回复可停止
- **Queue State**: `isProcessing` 标记队列处理中 + `isSearchProcessing` 标记当前为 search 操作
- **History Scroll**: 滚动到顶自动加载更多历史 + `restoreScrollPosition` 保持位置
- **Initial Scroll**: `await nextTick()` → 双重 rAF `scrollToBottom()` 确保进入对话时滚动到底
- **Markdown Rendering**: `marked` 标准解析（代码块、表格、标题），仅 assistant 消息，`white-space: pre-wrap` 仅应用于 user 消息
- **Layout**: `justify-content: space-between` 左（attach+ref）右（stop+send）分组
- **Loading/Error UI**: EditorPage skeleton + error result + 重试按钮
- **Apply/Accept**: `/rag/apply-modification` → PDF regenerate
- **Supplement**: Open dialog, contextualized query construction

## Testing

- Vitest, 68 tests in `src/tests/utils.test.ts`
- Coverage: auth, API types, store, queue, reasoning, disabled cards
