# ResuChat 🎯

> 对话式简历审批工具 · Conversational Resume Review & Approval Tool

基于 AI 大模型的智能简历审批系统，通过对话交互完成简历上传、AI 分析、优化建议、修改审批的全流程。

## 项目结构

```
resuchat/
├── packages/
│   ├── server/        # @resuchat/server — 后端服务
│   │   ├── src/
│   │   │   ├── auth/          # 手机号 + 验证码登录
│   │   │   ├── lib/           # AI SDK、向量数据库、文档处理
│   │   │   ├── routes/        # API 路由（RAG 对话 / 管理）
│   │   │   └── storage/       # SQLite + 文件存储
│   │   ├── fonts/             # PDF 中文字体
│   │   └── test/              # Vitest 测试
│   └── web/           # @resuchat/web — 前端界面
│       └── src/
│           ├── pages/         # 登录 / 对话列表 / 编辑器
│           ├── components/    # 聊天面板、PDF 预览、修改审核
│           ├── composables/   # AI 对话、消息队列、历史管理
│           └── stores/        # Pinia 状态管理
└── pnpm-workspace.yaml
```

## 技术栈

| 层 | 技术 |
|---|---|
| **后端框架** | Express 5 + TypeScript |
| **前端框架** | Vue 3.5 + TypeScript |
| **UI 库** | Element Plus 2 + Tailwind CSS 4 |
| **AI SDK** | Vercel AI SDK v6 (`@ai-sdk/deepseek` + `@ai-sdk/vue`) |
| **语言模型** | DeepSeek（流式对话 + 工具调用） |
| **嵌入模型** | BGE-small-zh-v1.5（本地 HuggingFace，零外部调用） |
| **向量数据库** | LanceDB（ANN IVF_PQ 索引） |
| **关系数据库** | SQLite（better-sqlite3） |
| **文档处理** | PDF 解析/生成、DOCX 解析（pdf-parse, pdfmake, mammoth） |
| **缓存** | Redis + 内存 LRU fallback |

## 核心功能

- **智能对话审批** — 与 AI 对话式地分析和优化简历
- **RAG 增强检索** — 基于系统知识库的向量检索增强生成
- **流式推理展示** — 实时展示 AI 推理过程和优化建议
- **双工具系统** — 优化建议 + 具体修改，分步可控
- **简历 PDF 生成** — 修改后一键导出 PDF
- **修改审核** — 接受/补充/拒绝 AI 提出的修改

## 快速开始

### 前置要求

- Node.js >= 20
- pnpm >= 9
- DeepSeek API key

### 安装与启动

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp packages/server/.env.dev packages/server/.env
# 编辑 packages/server/.env，填入 DEEPSEEK_API_KEY

# 3. 启动后端（端口 3000）
pnpm dev:server

# 4. 新终端，启动前端（端口 5173，自动代理 /api → :3000）
pnpm dev:web

# 或者同时启动
pnpm dev
```

### 构建 & 测试

```bash
pnpm build           # 构建所有包
pnpm test            # 运行所有测试
pnpm lint            # 代码检查
```

## 架构示意

```
[浏览器] ──:5173──> [Vite 代理] ── /api ──> [Express :3000]
                                                │
                     ┌──────────────────────────┼──────────────────────────┐
                     ▼                          ▼                          ▼
               [SQLite]                   [LanceDB]                [DeepSeek API]
          用户/会话/消息              系统文档向量索引             流式对话 + 工具
```

## 各包文档

- [服务端文档](packages/server/README.md)
- [前端文档](packages/web/README.md)
