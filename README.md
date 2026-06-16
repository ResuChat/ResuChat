# ResuChat

ResuChat 是一个对话式 AI 简历优化系统。用户上传简历后，通过多轮 AI 对话对简历内容进行逐项优化，支持智能修改建议、一键采纳/拒绝、版本管理和 PDF 导出。项目还提供用户文档库和系统知识库（RAG）能力，适用于求职辅导、简历润色等场景。

## 功能

| 功能 | 说明 |
| ---- | ---- |
| 对话式简历优化 | 通过 AI 对话对简历进行逐项修改，支持多轮迭代 |
| 简历解析与展示 | 上传 PDF / DOCX / Markdown / TXT 简历，自动提取文本并展示，支持 PDF 预览 |
| 智能修改建议 | AI 对简历片段生成修改建议，支持一键采纳或拒绝 |
| 文档库管理 | 用户可上传和管理多个简历/职位描述文档，跨会话复用 |
| 系统知识库 | 管理员上传分组文档，全局 RAG 检索增强 AI 回答 |
| PDF 导出 | 修改完成后一键导出优化后的简历 PDF |
| 会话管理 | 多会话独立上下文，支持历史会话检索和继续编辑 |
| 多用户与角色 | 支持 normal / premium / admin 三种角色，精细权限控制 |

## 仓库结构

```text
resuchat/
├── docker/                        # Docker 部署配置
├── packages/                      # 子包目录
│   ├── server/                    # 后端 API、认证、文档处理、RAG、消息持久化
│   │   ├── src/
│   │   │   ├── routes/            # 路由定义
│   │   │   ├── controllers/       # 请求入参与响应封装
│   │   │   ├── services/          # 业务逻辑（chat / document）
│   │   │   ├── middleware/        # 认证、鉴权、上传、校验
│   │   │   ├── storage/           # Drizzle 数据访问
│   │   │   ├── lib/               # 工具库（ai / document / pdf）
│   │   │   ├── dto/               # 请求/响应类型
│   │   │   ├── db/                # Drizzle schema 与 client
│   │   │   ├── workers/           # BullMQ worker
│   │   │   └── types/             # 类型定义
│   │   ├── test/                  # Vitest 测试
│   │   ├── scripts/               # 运维脚本
│   │   └── .env.example           # 环境变量模板
│   ├── web/                       # 前端页面、聊天面板、PDF 预览、文档引用交互
│   │   ├── src/
│   │   │   ├── pages/             # 页面组件
│   │   │   ├── components/        # 功能组件（chat / editor / sidebar / suggestion）
│   │   │   ├── composables/       # Vue 组合式逻辑
│   │   │   ├── stores/            # Pinia 状态管理
│   │   │   ├── api/               # HTTP 客户端
│   │   │   └── lib/               # 工具函数
│   │   ├── public/                # 静态资源（PDF.js worker、字体映射）
│   │   └── tests/                 # 前端测试
│   └── shared/                    # 前后端共享类型与 API 定义
│       └── src/
│           ├── domain/            # 领域模型
│           └── api/               # 接口类型
├── scripts/                       # 通用运维脚本
├── LICENSE                        # AGPL-3.0 许可
├── package.json
├── pnpm-workspace.yaml            # pnpm 工作区定义
└── tsconfig.base.json             # 共享 TypeScript 配置
```

## 技术栈

| 层   | 技术                                                                              |
| ---- | --------------------------------------------------------------------------------- |
| 前端 | Vue 3.5、TypeScript、Pinia、Vue Router、Element Plus、Tailwind CSS v4、pdfjs-dist |
| 后端 | Express 5、TypeScript、Drizzle ORM、PostgreSQL、Redis、BullMQ、WebSocket          |
| AI   | Vercel AI SDK v6、LangChain、DeepSeek、HuggingFace Transformers                          |
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

## 进一步阅读

- [packages/server/README.md](packages/server/README.md)
- [packages/server/DATABASE.md](packages/server/DATABASE.md)
- [packages/web/README.md](packages/web/README.md)
