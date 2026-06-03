# 系统架构与运行逻辑说明

> 文档版本: 2026-05-30

---

## 一、架构总纲

### 1.1 数据层级策略

| 层级 | 数据策略 | 搜索方式 | Prompt 定位 |
|---|---|---|---|
| **会话级参考文件**（用户上传的 JD、公司介绍等） | 全文合并 | 不进行向量搜索 | 该岗位的具体要求，修改建议应参考这些要求 |
| **系统级知识库**（平台预置的岗位标准、写作指南等） | 向量搜索 Top-K | LanceDB `system_chunks` 表 | 通用的行业最佳实践，可供参考 |
| **用户简历** | 全文合并 | 不进行搜索 | 需要修改的目标文档 |

### 1.2 语义向量模型

使用 `Xenova/bge-small-zh-v1.5` 作为语义嵌入模型，输出 512 维向量。搭配 Redis + 内存 LRU 双级缓存（SHA256 key, 24h TTL），冷启动时有互斥锁防止并发重复加载模型。

---

## 二、功能逻辑线

### 2.1 用户上传个人简历

**接口**：`POST /rag/start`

**请求参数**：
- `files`：待处理简历文件（支持 PDF 格式）
- `query`：初始提示信息（可选）

**执行序列**：

```
Step 1: 创建会话
  生成唯一标识 conversationId
  写入 conversations 表
  初始化进度跟踪（uploadProgress Map）

Step 2: 文件持久化存储
  计算文件 SHA256 摘要
  存储至 uploads/documents/by_hash/{hash}.pdf
  写入 global_documents（文件去重池，递增引用计数）
  写入 conversation_document_refs（doc_type = 'original'）

Step 3: 文本提取与 Markdown 转换
  使用 pdf-parse 提取纯文本内容
  调用 classifyReferenceFile() 预检文件是否为简历（非简历返回 400 拒绝）
  调用 LLM（deepseek-v4-flash, thinking: disabled, temperature: 0.1）转换为结构化 Markdown
  设置 AbortSignal.timeout(120000) 防止转换超时
  后处理：提取 ```markdown 代码块内容，或从第一个 ## 标题处截断
  目的：保证后续 modifySection（remark AST 替换）和 parseResumeSections（样式推断）有正确的标题标记

Step 4: 文本分块与索引
  使用 DocumentLoader（RecursiveCharacterTextSplitter, chunkSize = 1000, overlap = 200）对纯 Markdown 文本进行分块
  PDF 逐页解析，每个 chunk 的 metadata 记录 page（页码）
  清空该会话下原有 chunks，批量插入新分块（docType = 'resume', ref_id = 文档引用ID）

Step 5: 旧版本清理
  执行 cleanupOldVersions("original", 5)，保留最近 5 个版本
```

### 2.2 用户上传参考文件

**接口**：`POST /rag/search`（携带文件）

**执行序列**：

```
Step 1: 文件解析与分类
  提取文件文本内容（PDF 或纯文本）
  调用 LLM 进行分类：excellent_resume | reference_doc | unknown

Step 2: 文件持久化存储
  与简历上传流程相同（Step 2）
  doc_type = 'reference'

Step 3: 文本分块（不进入向量库）
  使用 DocumentLoader 进行分块
  每个块添加前缀标记：[分类标签: 文件名]
  写入 chunks 表（docType = 'reference', refCategory = 分类结果, ref_id = 文档引用ID）

Step 4: 加入当前搜索上下文
  · 分类为 excellent_resume → 加入优秀简历参考段
  · 分类为 reference_doc 及其他 → 加入岗位参考资料段
  · 以全文合并方式直接使用，不经过向量搜索（用户已主动上传，无需二次筛选）
```

### 2.3 用户发起搜索请求

**接口**：`POST /rag/search`

**执行序列**：

```
Step 1: 权限校验
  通过 authWithUser 中间件解析 userId
  验证用户对 conversationId 的所有权

Step 2: 加载索引数据
  调用 getConversationChunksWithTypes(conversationId)
  按 docType + refCategory 分为三类：
  · docType = 'resume' → 简历数据块
  · docType = 'reference' + refCategory = 'excellent_resume' → 优秀简历数据块
  · docType = 'reference' + 其他分类 → 参考资料数据块

Step 3: 简历全文提取（不做检索筛选）
  执行 mergeOverlappingChunks 合并所有简历数据块
  输出完整 resumeContent（Markdown 格式简历全文）

Step 4: 参考文件全文提取（用户上传文件，不做向量搜索）
  按 refId 分组，每组独立执行 mergeOverlappingChunks
  组间以 --- 文件名 --- 分隔
  输出 excellentResumeContent 与 referenceDocContent

Step 5: 系统级知识库检索（独立搜索通道）
  调用 searchSystemChunks(query, 3) 从 LanceDB 获取相似片段
  查询结果追加至 referenceDocContent
  如系统知识库为空，本步骤跳过

Step 6: 对话历史构建
  调用 buildHistoryPrompt(conversationId)
  包含已压缩的摘要链（conversation_summaries 表）与未摘要的最近消息（summarized = 0）
  输出 historySection

Step 7: 用户意图识别
  使用 StructuredOutputParser 调用 LLM 进行分类：
  · "建议"：用户要求分析简历、提出改进方向
   · "修改"：用户明确要求修改具体字段
   · "追问"：用户表达不明确或与简历无关
  如分类结果为"追问"，降级为"建议"处理（当前前端不支持追问的 SSE 流格式）
  Prompt 使用 `<user_query>` XML 标签包裹用户输入，实现结构化注入防御

Step 8: Prompt 构建
  调用 buildSearchPrompt，组装以下内容：
  · 系统安全指令
  · 对话历史摘要
  · 待修改简历全文
  · 优秀简历参考内容
  · 岗位参考资料内容（含系统知识库补充）
  · 用户查询内容
  · 参考资料使用指引
  · 工具调用说明（按意图选择建议工具或修改工具）
  · 输出格式约束

Step 9: 流式推理与结果存储
  调用 streamText（AI SDK, model = deepseek, 携带 tools）
  通过 SSE 流输出 text-delta、reasoning、tool-call、tool-result 等事件
  通过 onStepFinish 累积各步骤 reasoning 分片
  增量持久化使用 db.transaction() 事务包裹（user + assistant 写入原子化）
  流结束后执行 onFinish 回调：
  · 写入用户消息至 messages 表
  · 写入助手回复与完整推理过程（所有步骤累积）至 messages 表
  · 触发自动摘要流程（triggerAutoSummary）
```

### 2.4 用户采纳修改建议

**接口**：`POST /rag/apply-modification`

**请求参数**：
- `conversationId`：会话标识
- `optimization`：包含 `field`（字段名）、`current`（原文定位锚点，在简历中唯一）、`suggestion`（修改建议）、`reason`（修改原因，可选）
- `type`：操作类型（`accept` / `apply`）

**执行序列**：

```
Step 1: 加载简历全文
  从 chunks 表加载当前简历分块
  执行 mergeOverlappingChunks 合并为 fullText

Step 2: LLM 修改生成
  调用 buildApplyPrompt / buildAcceptPrompt(fullText, field, current, suggestion, reason)
  调用 getChatModel.invoke() 生成修改内容
  输出为 newContent（替换 current 的完整文本）

Step 3: replaceText 四级文本匹配
  调用 replaceText(fullText, current, newContent)
  ① indexOf 精确匹配
  ② 去 \n 展平后匹配
  ③ 规范化（\s+ → 空格）后匹配
  ④ 规范化后头尾40字定位范围
  匹配后映射回行号按行替换 → newFullText

Step 4: PDF 文档生成
  调用 parseResumeSections 解析 Markdown 为章节树
  调用 sectionsToContentArray 转换为 pdfmake 内容数组
  调用 generateResumePDF 生成 PDF 二进制数据（Uint8Array）

Step 5: 持久化存储
  调用 addFileToConversation（contentSnapshot = newFullText）
  调用 setConversationChunksWithTypes(newFullText)
  调用 cleanupOldVersions("modified", 5)
```

### 2.5 版本恢复

**接口**：`POST /rag/docs/:refId/restore`

**执行序列**：

```
查询 conversation_document_refs JOIN global_documents
获取 file_path、content_snapshot、doc_type

根据文档类型与快照状态分三条路径：

路径 A：doc_type = 'original'
  · 直接复制原始 PDF 文件
  · 不进行文本提取与重渲染，样式完整保留

路径 B：doc_type = 'modified' 且存在 content_snapshot
  · 直接使用快照中的 Markdown 文本
  · 调用 parseAIContent → generateResumePDF

路径 C：doc_type = 'modified' 且不存在 content_snapshot（历史版本）
  · 使用 pdf-parse 提取文本
  · 过滤页码标记（--1 of 7-- 等）
  · 调用 parseAIContent → generateResumePDF

统一后处理：
  · addFileToConversation（附带 contentSnapshot）
  · setConversationChunksWithTypes
  · cleanupOldVersions("modified", 5)
```

### 2.6 自动摘要生成

**触发入口**：`storeMessage()` 每次写入消息后自动触发（异步，非阻塞）

**配置参数**：

| 参数 | 值 | 说明 |
|---|---|---|
| `SUMMARY_TRIGGER` | 60 | 未摘要消息达到此阈值时触发 |
| `SUMMARY_BATCH` | 40 | 每次提取 40 条生成摘要，保留 20 条 |
| `MAX_UNCOMPRESSED` | 5 | 摘要段数超过此上限时触发压缩 |

**执行序列**：

```
Step 1: 计数检查
  统计 messages 表中 summarized = 0 的记录数
  若 < 60，直接返回

Step 2: 提取待处理消息
  定位上次摘要的结束标识（end_message_id）
  取该标识之后的 40 条未摘要消息

Step 3: 链式引用
  查询上一条摘要记录：
  · 存在 → 以"上一条摘要 + 新消息"构建 Prompt
  · 不存在 → 仅以新消息构建 Prompt
  Prompt 要求：总结新内容（400 字以内），末尾列出待办事项

Step 4: LLM 摘要生成与存储
  调用 ChatDeepSeek.invoke()
  写入 conversation_summaries 表
  标记当前批次消息为 summarized = 1

Step 5: 段数检查与压缩
  若摘要总段数 > 5：
  · 仅 1 段超标 → 直接清除待办标记后作为纯背景保留（跳过 LLM 调用）
  · 2 段以上 → 调用 LLM 合并压缩为 600 字纯背景摘要（不含待办）
```

### 2.7 系统级知识库管理

#### 文档上传

**接口**：`POST /admin/system-documents`（authMiddleware 鉴权）

**请求参数**：
- `file`：文档文件
- `docType`：文档类型（`excellent_resume` | `reference_doc`）
- `category`：分类标签

**执行序列**：

```
Step 1: 文件解析
  提取文本内容（PDF 使用 pdf-parse，其他格式直接读取）
  校验内容长度 ≥ 100 字符

Step 2: 文件持久化
  计算 SHA256 摘要，写入 uploads/documents/by_hash/{hash}.ext
  写入 global_documents（文件去重池，递增引用计数）

Step 3: 元数据登记
  写入 system_documents 表（记录 globalDocId、docType、category、文件名）

Step 4: 分块与向量索引
  使用 DocumentLoader 进行分块
  调用 indexSystemDocumentChunks → 写入 LanceDB system_chunks 表（ANN IVF_PQ 索引）
```

#### 文档启停

**接口**：`PATCH /admin/system-documents/:id`（authMiddleware 鉴权）

**请求参数**：`{ active: 0 | 1 }`

切换 `system_documents.active` 字段，用于在搜索中屏蔽/启用某条知识库文档。

#### 文档删除

**接口**：`DELETE /admin/system-documents/:id`（authMiddleware 鉴权）

**执行序列**：

```
Step 1: 查询关联信息
  联查 system_documents 与 global_documents，获取 globalDocId 与文件路径

Step 2: 向量数据清理
  调用 deleteSystemChunks(globalDocId)，从 system_chunks 表删除对应向量

Step 3: 关联记录清除
  删除 system_documents 记录
  递减 global_documents 的引用计数

Step 4: 物理文件回收
  若引用计数归零：
  · 删除物理文件
  · 删除 global_documents 记录
```

---

## 三、存储体系

### 3.1 数据表结构

```
SQLite:

chunks ───┐
  conversation_id = 会话ID
  docType = 'resume' | 'reference'
  ref_id = 关联 conversation_document_refs.id（精确追踪文件归属）
  metadata = { source, index, page }（PDF 逐页解析页码信息）
  deleted = 0|1（软删除标记）
  └── refCategory: excellent_resume | reference_doc

conversation_document_refs
  docType = 'original'    → 原始简历
  docType = 'reference'   → 参考文件
  docType = 'modified'    → 修改版本（含 content_snapshot 结构化快照）

system_documents ──── 系统级知识库
  docType = 'excellent_resume' | 'reference_doc'
  category = 分类标签

global_documents ──── 全局文件去重池（SHA256）
  file_hash UNIQUE, reference_count

conversation_summaries ──── 对话摘要缓存
  summary, message_count, start_message_id, end_message_id

LanceDB:

system_chunks ──── 系统级知识库向量索引（ANN IVF_PQ）
  { vector: Float32[512], text, globalDocId, docType, category, chunkIndex }
  评分公式: 1 / (1 + distance²)
```

### 3.2 文件去重机制

```
写入流程：
  SHA256(buffer) → 查 global_documents
    ├── 已存在 → reference_count += 1
    └── 不存在 → INSERT + 写入物理文件

删除流程：
  删除关联记录 → reference_count -= 1
    └── ≤ 0 → 删除物理文件 + 删除 global_documents 记录
```

### 3.3 版本控制机制

`cleanupOldVersions(conversationId, docType, maxVersions = 5)`

按 `version` 降序排列，保留最新 5 个版本，超出的逐条执行：
1. 删除 `conversation_document_refs` 记录
2. 递减 `global_documents`.`reference_count`
3. 引用归零时删除物理文件

---

## 四、向量搜索体系

### 4.1 搜索范围

| 数据源 | 搜索方式 | 表 | 备注 |
|---|---|---|---|
| 会话级参考文件 | 全文合并（不搜索） | SQLite `chunks` | 用户已筛选，无需二次检索 |
| 系统级知识库 | 向量搜索 Top-3 | LanceDB `system_chunks` | 大量数据中定位相关内容 |

### 4.2 搜索流程

```
searchSystemChunks(query, k = 3, category?):

  1. 嵌入计算
     embed(query) → Float32[512]
        HuggingFace bge-small-zh-v1.5（Redis + 内存 LRU 缓存）

  2. 向量检索
     LanceDB ANN IVF_PQ 索引
     score = 1 / (1 + distance²)（平滑永不归零）
     可选按 category 字段过滤

  3. 结果处理
     若无 system_chunks 表（系统知识库未导入）→ 返回空数组
     若已导入 → 返回 { text, score, docType, category }
```

---

## 五、核心设计原则

1. **用户上传的文件不进行向量搜索**：用户已主动确认文件的相关性，无需二次检索，直接以全文形式进入 Prompt
2. **系统级知识库需要向量搜索**：大量文档中无法预知相关性，需通过语义搜索定位最相关内容
3. **用户上传内容优先于系统内容**：Prompt 中会话级参考文件排列在前，系统级补充排列在后
4. **参考资料作为修改依据**：LLM 应参考岗位要求生成针对性建议，而非仅作背景了解
5. **文件引用计数闭环管理**：`global_documents` 统一管理所有文件的生命周期，引用归零时自动回收物理文件
6. **摘要链式引用与分级压缩**：分段摘要携带待办清单，压缩摘要仅保留纯背景信息，避免待办混淆
