# @resuchat/server

ResuChat 后端，负责认证、会话、聊天搜索、修改应用、文档管理和系统级 RAG。
当前仍是一个 Express 服务；BullMQ worker 可作为独立进程运行，用于文档解析、系统知识库索引、邮件发送等异步任务。

## 技术栈

- Express 5
- TypeScript
- Drizzle ORM + PostgreSQL
- AI SDK v6 + LangChain
- DeepSeek
- LanceDB
- Redis
- BullMQ

## 目录结构

```text
src/
  index.ts
  routes/
    auth/
    chat/
    conversation/
    documents/
    modify/
    admin/
    user/
    user-documents/
  controllers/
  services/
    chat/
    document/
  middleware/
  storage/
    conversation/
    document/
    user/
  lib/
    ai/
    document/
    pdf/
  dto/
  types/

src/db/
  schema.ts
  client.ts
  # 数据表以 Drizzle schema 为准；开发期用 db:push，同步视图走 scripts/sync-drizzle-views.ts

test/
  helpers/
  api-http.test.ts
  chunk-classification.test.ts
  conversation-storage.test.ts
  search-execution.test.ts
  stream-persistence.test.ts
  text.test.ts
  url.test.ts
  validate-middleware.test.ts
  resume-markdown.test.ts
  token.test.ts
  pagination.test.ts
```

## 开发命令

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm worker
pnpm run vector:check-system
pnpm run vector:rebuild-system
```

数据库：

```bash
pnpm db:push
pnpm db:views
```

当前仍处于开发阶段，数据库表结构以 [src/db/schema.ts](./src/db/schema.ts) 为准，使用 Drizzle Kit `push` 同步；`pnpm db:push` 会在同步表结构后预创建 `global_document_ref_counts` 视图。

## 必需环境变量

- `JWT_SECRET`
- `DEEPSEEK_API_KEY`
- `DATABASE_URL`

常用可选项：

- `PORT`
- `ALLOWED_ORIGINS`
- `USE_REDIS`
- `REDIS_HOST`
- `REDIS_PORT`
- `SMTP_*`
- `DEFAULT_MODEL`
- `FAST_MODEL`

具体默认值和开关见 [src/lib/config.ts](./src/lib/config.ts)。

## 当前接口

### Auth

| 方法   | 路径                     | 说明           |
| ------ | ------------------------ | -------------- |
| `POST` | `/auth/captcha/generate` | 生成图形验证码 |
| `POST` | `/auth/send-email-code`  | 发送邮箱验证码 |
| `POST` | `/auth/register`         | 邮箱注册       |
| `POST` | `/auth/login`            | 登录           |
| `POST` | `/auth/refresh`          | 刷新 token     |
| `POST` | `/auth/logout`           | 退出登录       |

### User

| 方法    | 路径                    | 说明     |
| ------- | ----------------------- | -------- |
| `GET`   | `/user/profile`         | 获取资料 |
| `PATCH` | `/user/profile`         | 更新资料 |
| `PATCH` | `/user/bind-phone`      | 绑定手机 |
| `PATCH` | `/user/change-password` | 修改密码 |
| `POST`  | `/user/avatar`          | 上传头像 |

### Conversation / Chat

| 方法     | 路径                                    | 说明                 |
| -------- | --------------------------------------- | -------------------- |
| `GET`    | `/conversations`                        | 会话列表             |
| `GET`    | `/conversations/start/progress/:convId` | 上传进度             |
| `POST`   | `/conversations/start`                  | 上传文件并建会话     |
| `POST`   | `/conversations/start-from-doc`         | 从已有用户文档建会话 |
| `GET`    | `/conversations/:id/messages`           | 拉取消息和文档       |
| `DELETE` | `/conversations/:id`                    | 软删除会话           |
| `POST`   | `/conversations/:id/restore`            | 恢复会话             |
| `POST`   | `/chat/search`                          | 主搜索 SSE           |
| `POST`   | `/chat/summarize`                       | 生成摘要             |

### Documents

| 方法     | 路径                                 | 说明                 |
| -------- | ------------------------------------ | -------------------- |
| `GET`    | `/documents`                         | 当前用户会话文档列表 |
| `GET`    | `/documents/:conversationId/history` | 文档版本历史         |
| `DELETE` | `/documents/:refId`                  | 删除文档引用         |
| `POST`   | `/documents/:refId/restore`          | 恢复文档版本         |
| `GET`    | `/documents/:refId/download`         | 下载文档             |

### User Documents

| 方法     | 路径                               | 说明                     |
| -------- | ---------------------------------- | ------------------------ |
| `GET`    | `/user-documents`                  | 用户文档库列表           |
| `POST`   | `/user-documents`                  | 上传用户文档             |
| `POST`   | `/user-documents/import`           | 导入现有文档到用户文档库 |
| `PATCH`  | `/user-documents/:id`              | 重命名                   |
| `POST`   | `/user-documents/:id/retry-parse`  | 重试解析                 |
| `POST`   | `/user-documents/:id/cancel-parse` | 取消解析                 |
| `DELETE` | `/user-documents/:id`              | 删除                     |
| `GET`    | `/user-documents/:id/download`     | 下载                     |

### Modify / Admin

| 方法     | 路径                                | 说明             |
| -------- | ----------------------------------- | ---------------- |
| `POST`   | `/modify/apply`                     | 应用修改         |
| `POST`   | `/modify/render-pdf`                | 结构化内容转 PDF |
| `POST`   | `/admin/system-documents`           | 上传系统文档     |
| `GET`    | `/admin/system-documents`           | 系统文档列表     |
| `GET`    | `/admin/system-documents/:id`       | 单文档详情       |
| `PATCH`  | `/admin/system-documents/:id`       | 修改元数据       |
| `DELETE` | `/admin/system-documents/:id`       | 删除             |
| `GET`    | `/admin/system-document-groups`     | 系统知识库分组   |
| `POST`   | `/admin/system-document-groups`     | 创建分组         |
| `PATCH`  | `/admin/system-document-groups/:id` | 更新分组         |
| `DELETE` | `/admin/system-document-groups/:id` | 删除分组         |

## 当前实现说明

- 服务启动时会执行：
  - `warmupEmbedding()`
- 系统知识库向量 schema 检测和重建属于运维动作，不在 server/worker 启动或索引任务运行时自动执行；版本升级后先跑 `pnpm run vector:check-system`，需要时跑 `pnpm run vector:rebuild-system`。
- BullMQ worker 负责用户文档解析、系统知识库入库、邮件发送和 PDF 生成等异步任务。
- 系统知识库文档走 LanceDB 检索，上传后由 worker 解析、LLM 分类、Markdown 格式化并写入向量库。
- 会话级简历和参考文件不做向量检索，直接按全文进入 prompt。
- 搜索请求不再依赖前端传 `messages`，后端自行读取最近消息上下文。
- 用户消息附件持久化在 `messages.attachments`，用于恢复消息气泡上的参考资料信息。
- 会话参考资料列表读取 `conversation_document_refs`，文档库来源存在时优先显示 `user_documents.local_name`，否则回退会话引用显示名或原始文件名。
- SSE 中断时，消息立即按当前可见内容持久化为 `interrupted`。

## 测试说明

已经拆分的测试主题：

- HTTP 与认证
- chunk 分类与 `refId`
- 会话初始提示词与 reasoning 持久化
- SSE 消费与流式落库
- 文本工具函数、URL 校验、中间件校验

数据库相关测试需要可用的 PostgreSQL 测试环境。
