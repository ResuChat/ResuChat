# aiagent

Express + AI SDK v6 + LangChain + DeepSeek + LanceDB

## Important

**All AI responses must be in Chinese.** Include "请用中文回答" in prompts.

## 操作指引

- **优先使用 MCP 服务** 进行文件读写、搜索、网页抓取等操作

## Commands

```
npm run dev       # nodemon + tsx, watches src/
npm run build     # tsc → dist/
npm start         # node dist/index.js
npm test          # vitest --run
npm test:watch    # vitest watch
```

## Environment

- `DEEPSEEK_API_KEY` required
- `PORT` defaults to 3000
- `ALLOWED_ORIGINS` — CORS whitelist

## Architecture

```
src/
  index.ts              # Entry, routes + shutdown + CORS
  routes/
    rag/
      index.ts          # Orchestrator: mounts all handler routes
      utils.ts          # Shared utilities (decodeFilename, mergeOverlappingChunks, etc.)
      handlers/         # Route handlers (thin: req → service → res)
        search.ts       # POST /rag/search
        start.ts        # POST /rag/start + GET /rag/start/progress
        modify.ts       # POST /rag/apply-modification + POST /rag/render-resume-pdf
        documents.ts    # GET/DELETE/POST /rag/docs/*
        summarize.ts    # POST /rag/summarize
      services/         # Business logic (no route registration)
        perform-search.ts  # SSE orchestration: auth → context → intent → streamText
        rag-context.ts     # Chunk/file/URL loading + tempDir lifecycle
        intent.ts          # Intent classification (建议/修改/追问)
        tools.ts           # updateResumeTool + proposeModificationTool
    conversation/       # GET/POST/DELETE conversations + messages
    user/               # GET /user/profile
    admin/              # System knowledge base CRUD (+ PATCH active)
  lib/
    providers.ts        # ChatDeepSeek + embedding (Redis + 内存 LRU 双级缓存) + p-retry
    prompts.ts          # ChatPromptTemplate + XML 标签结构化注入防御
    resume-pdfmaker.ts  # PDF generation (pdfmake + SourceHanSansSC)
    resume-markdown.ts  # replaceText (4-level matching), modifySection
    vector-db.ts        # LanceDB index（ANN IVF_PQ）/ search / delete
    pagination.ts       # Shared pagination utility
    document-loader.ts  # DocumentLoader（文档加载+分块+页码元数据，零检索）
  auth/                 # Login, logout, token middleware, captcha
  storage/              # schema.sql + repository + file-manager + summary-manager
```

## Key Dependencies

| Package | Purpose |
| :--- | :--- |
| `@ai-sdk/deepseek` | Main search (reasoning + SSE + tools, maxRetries: 3) |
| `@langchain/core` | StructuredOutputParser, ChatPromptTemplate |
| `@langchain/deepseek` | Offline LLM calls (p-retry 3次指数退避) |
| `@lancedb/lancedb` | System-level vector DB (ANN IVF_PQ) |
| `@huggingface/transformers` | `Xenova/bge-small-zh-v1.5` embedding |


## Core Features

- **Conversation Init**: Upload resume (PDF/DOCX) → classifyReferenceFile 预检 → LLM Markdown 转换 (120s 超时) → chunks 存储 (ref_id 直标) → progress polling
- **RAG Search**: Intent classification → tool registration → streamText → onStepFinish 事务包裹增量持久化
- **Intent Types**: `建议`/`修改`/`追问` via `StructuredOutputParser`
- **Tools**: `updateResumeTool` + `proposeModificationTool` → unified `{ field, current, suggestion, reason }`
- **Text Replacement**: 4-level matching (exact → flat → normalized → head+tail)
- **Auto Summary**: Chain-based, triggers at 60 unsummarized messages
- **PDF Generation**: pdfmake, Markdown inline parsing, nested lists
- **Embedding Cache**: Redis 优先 + 内存 LRU (SHA256 key, 24h TTL)；冷启动互斥锁
- **Streaming**: SSE `onStepFinish` 事务包裹 (首次 INSERT + 后续 UPDATE)
- **Prompt Defense**: XML `<user_query>` 标签结构化注入防御
- **Chunk Tracking**: `chunks.ref_id` 直标（无需中间映射表），软删除 + 页码元数据

## LLM Architecture

| Use Case | SDK | Model |
| :--- | :--- | :--- |
| Main search (streaming) | `@ai-sdk/deepseek` | `deepseek-v4-pro` |
| Classify/apply/summarize | `@langchain/deepseek` | `deepseek-v4-pro` |
| Markdown conversion | `@langchain/deepseek` | `deepseek-v4-flash` |

## API Endpoints

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | `/rag/start` | Yes | Upload resume + start (classifyReferenceFile 预检) |
| GET | `/rag/start/progress/:convId` | Yes | Poll processing progress |
| POST | `/rag/search` | Yes | Main search (SSE stream) |
| POST | `/rag/apply-modification` | Yes | Apply/supplement modification |
| POST | `/rag/render-resume-pdf` | Yes | Render PDF from markdown |
| POST | `/rag/summarize` | Yes | Generate conversation summary |
| GET | `/rag/docs` | Yes | List reference files |
| GET | `/rag/docs/:conversationId/history` | Yes | Doc version history |
| DELETE | `/rag/docs/:refId` | Yes | Delete document |
| POST | `/rag/docs/:refId/restore` | Yes | Restore historical version |
| GET | `/rag/docs/:refId/download` | Yes | Download document file |

## Testing

- `npm test` = vitest, 68 tests in `test/`
- Coverage: routes, auth, captcha, RAG, storage, chunk classification, resume-markdown, pagination, schemas, URL validation
