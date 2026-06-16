# @resuchat/server

ResuChat 后端，负责认证、会话、聊天搜索、修改应用、文档管理和系统级 RAG。
当前仍是一个 Express 服务；BullMQ worker 可作为独立进程运行，用于文档解析、系统知识库索引、邮件发送等异步任务。

## 功能

| 功能 | 说明 |
| ---- | ---- |
| 对话式简历优化 | AI 驱动的多轮对话简历逐项修改 |
| 简历解析 | PDF / 图片简历自动文本提取与结构化 |
| 智能修改建议 | LLM 生成结构化修改建议，支持预览/采纳/拒绝 |
| 文档库 | 用户独立文档管理，跨会话复用简历与职位描述 |
| 系统知识库 | 管理员分组管理，LanceDB 向量检索增强 AI 回答 |
| PDF 导出 | 修改后一键生成格式化简历 PDF |
| 消息持久化 | SSE 流式写入，中断时按已产出内容立即落库 |
| WebSocket | 实时推送会话状态与文档解析进度 |

## 技术栈

- Express 5
- TypeScript
- Drizzle ORM + PostgreSQL
- Vercel AI SDK v6 + LangChain
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

## 测试说明

已经拆分的测试主题：

- HTTP 与认证
- chunk 分类与 `refId`
- 会话初始提示词与 reasoning 持久化
- SSE 消费与流式落库
- 文本工具函数、URL 校验、中间件校验

数据库相关测试需要可用的 PostgreSQL 测试环境。

## 许可

AGPL-3.0-only. 详见项目根目录 [LICENSE](../../LICENSE)。
