# ResuChat

对话式 AI 简历优化助手。项目采用 `pnpm workspace` Monorepo，包含：

- `packages/server`: Express + Drizzle ORM + PostgreSQL + LanceDB
- `packages/web`: Vue 3 + Vite + Element Plus + Tailwind CSS v4

## 仓库结构

```text
resuchat/
├─ packages/
│  ├─ server/   后端 API、认证、文档处理、RAG、消息持久化
│  └─ web/      前端页面、聊天面板、PDF 预览、队列与文档引用交互
├─ AGENTS.md    项目协作文档
├─ CLAUDE.md    项目实现说明
└─ pnpm-workspace.yaml
```

## 技术栈

| 层   | 技术                                                                              |
| ---- | --------------------------------------------------------------------------------- |
| 前端 | Vue 3.5、TypeScript、Pinia、Vue Router、Element Plus、Tailwind CSS v4、pdfjs-dist |
| 后端 | Express 5、TypeScript、Drizzle ORM、PostgreSQL、Redis、BullMQ、WebSocket          |
| AI   | AI SDK v6、LangChain、DeepSeek、HuggingFace Transformers                          |
| 存储 | PostgreSQL、LanceDB、本地文件系统                                                 |

## 根命令

```bash
pnpm install
pnpm dev:server
pnpm dev:worker
pnpm dev:web
pnpm build
pnpm lint
pnpm format
pnpm test
pnpm typecheck
```

说明：

- `pnpm test` 运行工作区 Vitest。
- `pnpm typecheck` 会对前后端分别执行 `tsc --noEmit`。
- 开发服务按需单独启动：`pnpm dev:server`、`pnpm dev:web`、`pnpm dev:worker`。
- 系统知识库上传后的分类与向量化依赖 worker 消费队列。

## Docker

Docker 配置集中在 [docker](docker) 目录：

```bash
docker compose -f docker/compose.yml up --build
```

## 环境变量

至少需要：

- `JWT_SECRET`
- `DEEPSEEK_API_KEY`
- `DATABASE_URL`

常用可选项：

- `PORT`，默认 `3000`
- `ALLOWED_ORIGINS`，逗号分隔的 CORS 白名单
- `USE_REDIS`、`REDIS_HOST`、`REDIS_PORT`
- `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`

## 当前前端路由

| 路径                    | 页面                            |
| ----------------------- | ------------------------------- |
| `/`                     | `LoginPage`                     |
| `/app/chat`             | `NewChatPage`                   |
| `/app/chat/:id`         | `EditorPage`                    |
| `/app/conversations`    | `SearchConversationsPage`       |
| `/app/documents`        | `DocumentLibraryPage`           |
| `/app/system-knowledge` | `SystemKnowledgePage`，仅管理员 |

## 当前后端主接口

| 方法   | 路径                            | 说明                                 |
| ------ | ------------------------------- | ------------------------------------ |
| `POST` | `/auth/register`                | 邮箱注册                             |
| `POST` | `/auth/login`                   | 手机密码 / 邮箱密码 / 邮箱验证码登录 |
| `POST` | `/auth/refresh`                 | 刷新 token                           |
| `POST` | `/auth/logout`                  | 退出登录                             |
| `GET`  | `/user/profile`                 | 当前用户信息                         |
| `GET`  | `/conversations`                | 会话列表                             |
| `POST` | `/conversations/start`          | 上传文件并创建会话                   |
| `POST` | `/conversations/start-from-doc` | 从已有用户文档创建会话               |
| `POST` | `/chat/search`                  | 主聊天搜索，SSE 流式返回             |
| `POST` | `/modify/apply`                 | 应用修改                             |
| `GET`  | `/documents`                    | 会话文档列表                         |
| `GET`  | `/user-documents`               | 用户文档库                           |
| `GET`  | `/admin/system-documents`       | 系统知识库管理                       |
| `GET`  | `/admin/system-document-groups` | 系统知识库分组                       |

## 当前实现要点

- 聊天搜索请求以 `query` 为准，后端不再依赖前端传整段 `messages`。
- 仅附带文件或引用文档时，前端会兜底生成查询词，保证搜索请求总有 `query`。
- 用户消息附件会持久化到 `messages.attachments`，消息气泡显示本次发送携带的参考资料。
- 参考资料面板只展示后端已绑定到当前会话的参考资料列表，不对上传或文档库引用做乐观更新。
- 从文档库引用参考资料时，面板优先展示用户文档名称，缺失时回退会话引用名或原始文件名。
- SSE 中断采用所见即所得策略：客户端断开时，消息立即按当前已产出内容落库并标记 `interrupted`，不做后台继续跑的兜底。
- 服务启动时会主动预热 embedding；系统知识库向量 schema 检测和重建不放在运行时自动执行，版本升级后通过 `pnpm --filter @resuchat/server run vector:check-system` 检查，需要时运行 `pnpm --filter @resuchat/server run vector:rebuild-system`。
- 系统知识库由管理员维护分组并上传文档，解析、分类和向量化通过 BullMQ worker 异步完成，LanceDB 仅用于系统知识库检索。

## 测试

前端测试位于 `packages/web/src/tests`，已按主题拆分。

后端测试位于 `packages/server/test`，已按主题拆分，包括：

- `api-http.test.ts`
- `chunk-classification.test.ts`
- `conversation-storage.test.ts`
- `stream-persistence.test.ts`
- `search-execution.test.ts`
- `text.test.ts`
- `url.test.ts`
- `validate-middleware.test.ts`

## 进一步阅读

- [AGENTS.md](AGENTS.md)
- [CLAUDE.md](CLAUDE.md)
- [packages/server/README.md](packages/server/README.md)
- [packages/server/DATABASE.md](packages/server/DATABASE.md)
- [packages/web/README.md](packages/web/README.md)
