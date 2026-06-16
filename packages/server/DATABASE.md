# 数据库文档

> 基于 `packages/server/src/db/schema.ts`，文档日期：2026-06-11

## 1. 数据模型概览

```text
User
 ├─ LoginHistory
 ├─ Conversation
 │   ├─ Message
 │   ├─ Chunk
 │   ├─ ConversationDocumentRef
 │   └─ ConversationSummary
 └─ UserDocument

GlobalDocument
 ├─ ConversationDocumentRef
 ├─ UserDocument
 ├─ SystemDocument
 └─ GlobalDocumentRefCount(view)

SystemDocumentGroup
 └─ SystemDocument
```

说明：

- `User` 是账号、会话、消息和用户文档库的归属根。
- `Conversation` 下挂消息、RAG chunks、文档引用和摘要。
- `GlobalDocument` 是全局去重文件池，被会话引用、用户文档库和系统知识库复用。
- `SystemDocumentGroup` 维护系统知识库树形分组；系统文档通过 `groupId` 关联分组。
- `GlobalDocumentRefCount` 是视图，用于实时计算全局文件引用数量，不是物理表。

## 2. 主要表

### 2.1 `users`

| 字段        | 类型      | 说明                                                    |
| ----------- | --------- | ------------------------------------------------------- |
| `id`        | `String`  | UUID 主键                                               |
| `phone`     | `String?` | 手机号，唯一                                            |
| `email`     | `String?` | 邮箱，唯一                                              |
| `password`  | `String?` | 哈希后的密码                                            |
| `nickname`  | `String`  | 昵称                                                    |
| `avatar`    | `String?` | 头像路径                                                |
| `role`      | `String`  | 用户角色：`normal` / `premium` / `admin`，默认 `normal` |
| `createdAt` | `BigInt`  | 创建时间                                                |
| `updatedAt` | `BigInt`  | 更新时间                                                |

主键：

- `PRIMARY KEY (id)`

唯一约束 / 索引：

- `users_phone_key`: `UNIQUE (phone)`
- `users_email_key`: `UNIQUE (email)`

说明：

- `role = admin` 才能访问 `/admin/*` 接口和前端系统知识库页面。
- `premium` 当前仅作为等级预留，暂未接入独立功能。

### 2.2 `login_history`

| 字段        | 类型      | 说明          |
| ----------- | --------- | ------------- |
| `id`        | `Int`     | 自增主键      |
| `userId`    | `String`  | 用户 id       |
| `token`     | `String`  | refresh token |
| `ip`        | `String?` | 登录 IP       |
| `userAgent` | `String?` | 设备信息      |
| `loginAt`   | `BigInt`  | 登录时间      |

主键：

- `PRIMARY KEY (id)`

外键：

- `user_id -> users.id ON DELETE CASCADE`

索引：

- `login_history_user_id_idx`: `(user_id)`

### 2.3 `conversations`

| 字段            | 类型      | 说明                 |
| --------------- | --------- | -------------------- |
| `id`            | `String`  | 会话 id              |
| `userId`        | `String`  | 所有者               |
| `title`         | `String?` | 会话标题             |
| `status`        | `String`  | `active` / `deleted` |
| `initialPrompt` | `String?` | 初始提示词           |
| `createdAt`     | `BigInt`  | 创建时间             |
| `updatedAt`     | `BigInt`  | 更新时间             |
| `deletedAt`     | `BigInt?` | 软删除时间           |

主键：

- `PRIMARY KEY (id)`

外键：

- `user_id -> users.id ON DELETE CASCADE`

索引：

- `conversations_user_id_idx`: `(user_id)`
- `conversations_user_id_updated_at_idx`: `(user_id, updated_at DESC)`

### 2.4 `messages`

| 字段             | 类型          | 说明                                      |
| ---------------- | ------------- | ----------------------------------------- |
| `id`             | `Int`         | 自增主键                                  |
| `conversationId` | `String`      | 所属会话                                  |
| `role`           | `MessageRole` | `user` / `assistant`                      |
| `content`        | `String`      | 消息正文                                  |
| `reasoning`      | `String`      | 推理内容                                  |
| `clientId`       | `String?`     | 客户端消息 id                             |
| `status`         | `String`      | `completed` / `streaming` / `interrupted` |
| `summarized`     | `Boolean`     | 是否已摘要                                |
| `displayContent` | `String?`     | 前端展示文本                              |
| `attachments`    | `Json?`       | 用户消息携带的参考资料附件信息            |
| `createdAt`      | `BigInt`      | 创建时间                                  |

主键：

- `PRIMARY KEY (id)`

外键：

- `conversation_id -> conversations.id ON DELETE CASCADE`

约束：

- `role` 使用枚举 `MessageRole`，当前取值为 `user` / `assistant`

索引：

- `messages_conversation_id_idx`: `(conversation_id)`
- `messages_conversation_id_created_at_idx`: `(conversation_id, created_at)`
- `messages_client_id_idx`: `(client_id)`

### 2.5 `chunks`

| 字段             | 类型      | 说明                                              |
| ---------------- | --------- | ------------------------------------------------- |
| `id`             | `Int`     | 自增主键                                          |
| `conversationId` | `String`  | 所属会话                                          |
| `pageContent`    | `String`  | chunk 文本                                        |
| `metadata`       | `Json?`   | 来源、页码等                                      |
| `source`         | `String?` | 源文件名                                          |
| `chunkIndex`     | `Int`     | 顺序号                                            |
| `role`           | `String`  | 会话内角色：`original` / `reference` / `modified` |
| `refId`          | `Int?`    | 关联 `conversation_document_refs.id`              |
| `scope`          | `String`  | 当前固定默认 `conversation`，预留 RAG 域字段      |
| `category`       | `String`  | 内容类型：`resume` / `job` / `unknown`            |
| `createdAt`      | `BigInt`  | 创建时间                                          |

主键：

- `PRIMARY KEY (id)`

外键：

- `conversation_id -> conversations.id ON DELETE CASCADE`
- `ref_id -> conversation_document_refs.id ON DELETE CASCADE`

索引：

- `chunks_conversation_id_idx`: `(conversation_id)`
- `chunks_conversation_id_ref_id_idx`: `(conversation_id, ref_id)`
- `chunks_conversation_id_chunk_index_idx`: `(conversation_id, chunk_index)`

### 2.6 `global_documents`

全局去重文件池，只保存文件本身的元数据，不再手动维护引用数量。

| 字段           | 类型     | 说明         |
| -------------- | -------- | ------------ |
| `id`           | `Int`    | 自增主键     |
| `fileHash`     | `String` | SHA256，唯一 |
| `filePath`     | `String` | 实际文件路径 |
| `originalName` | `String` | 原始文件名   |
| `fileType`     | `String` | 文件类型     |
| `fileSize`     | `Int`    | 文件大小     |
| `createdAt`    | `BigInt` | 创建时间     |

主键：

- `PRIMARY KEY (id)`

唯一约束 / 索引：

- `global_documents_file_hash_key`: `UNIQUE (file_hash)`

说明：

- 真实数据库表 `global_documents` 不包含 `reference_count` 列。
- 引用数量不写入全局文件表，统一通过 `global_document_ref_counts` 视图实时计算。
- 本地旧库如果曾经保留 `reference_count`，应执行 `ALTER TABLE global_documents DROP COLUMN IF EXISTS reference_count;` 清理遗留列。

### 2.6.1 `global_document_ref_counts`

全局文件引用计数视图，不是物理表。它通过 `conversation_document_refs`、`user_documents`、`system_documents` 实时聚合引用数量。

| 字段             | 类型  | 说明                 |
| ---------------- | ----- | -------------------- |
| `globalDocId`    | `Int` | 全局文件 id          |
| `referenceCount` | `Int` | 三类引用数量合计结果 |

对应数据库列名：

| Drizzle 字段     | 数据库列名        |
| ---------------- | ----------------- |
| `globalDocId`    | `global_doc_id`   |
| `referenceCount` | `reference_count` |

视图来源：

- `conversation_document_refs.global_doc_id`
- `user_documents.global_doc_id`
- `system_documents.global_doc_id`

约束说明：

- 视图自身不声明主键和外键。
- `global_doc_id` 来源于 `global_documents.id`，用于读取聚合后的引用数。

### 2.7 `user_documents`

用户文档库。

| 字段              | 类型      | 说明                                      |
| ----------------- | --------- | ----------------------------------------- |
| `id`              | `Int`     | 自增主键                                  |
| `userId`          | `String`  | 所有者                                    |
| `globalDocId`     | `Int`     | 关联全局文件                              |
| `localName`       | `String`  | 用户侧显示名                              |
| `source`          | `String`  | 来源：`upload` / `conversation`           |
| `parseStatus`     | `String`  | `pending` / `parsing` / `done` / `failed` |
| `category`        | `String`  | 内容类型：`resume` / `job` / `unknown`    |
| `markdownContent` | `String?` | 解析后内容                                |
| `createdAt`       | `BigInt`  | 创建时间                                  |

主键：

- `PRIMARY KEY (id)`

外键：

- `user_id -> users.id ON DELETE CASCADE`
- `global_doc_id -> global_documents.id`

唯一约束 / 索引：

- `user_documents_user_id_global_doc_id_key`: `UNIQUE (user_id, global_doc_id)`
- `user_documents_user_id_idx`: `(user_id)`

### 2.8 `conversation_document_refs`

会话中的文档引用与版本。

| 字段                   | 类型      | 说明                                              |
| ---------------------- | --------- | ------------------------------------------------- |
| `id`                   | `Int`     | 自增主键                                          |
| `conversationId`       | `String`  | 所属会话                                          |
| `globalDocId`          | `Int`     | 关联全局文件                                      |
| `role`                 | `String`  | 会话内角色：`original` / `reference` / `modified` |
| `version`              | `Int`     | 版本号                                            |
| `localName`            | `String`  | 会话引用显示名快照                                |
| `sourceUserDocumentId` | `Int?`    | 来源用户文档 id，仅从文档库引用时写入             |
| `contentSnapshot`      | `String?` | 结构化快照                                        |
| `createdAt`            | `BigInt`  | 创建时间                                          |
| `category`             | `String`  | 内容类型：`resume` / `job` / `unknown`            |

主键：

- `PRIMARY KEY (id)`

外键：

- `conversation_id -> conversations.id ON DELETE CASCADE`
- `global_doc_id -> global_documents.id`
- `source_user_document_id -> user_documents.id ON DELETE SET NULL`

索引：

- `conversation_document_refs_conversation_id_idx`: `(conversation_id)`
- `conversation_document_refs_global_doc_id_idx`: `(global_doc_id)`
- `conversation_document_refs_source_user_document_id_idx`: `(source_user_document_id)`

说明：

- `local_name` 是加入会话时的显示名快照，不表达来源关系。
- 从文档库引用文件时，`source_user_document_id` 指向 `user_documents.id`。
- 参考资料面板展示名称优先级为：`user_documents.local_name` -> `conversation_document_refs.local_name` -> `global_documents.original_name`。
- 如果来源用户文档被删除，外键置空后仍可使用会话引用显示名快照。

### 2.9 `system_document_groups`

系统知识库树形分组。

| 字段        | 类型      | 说明                       |
| ----------- | --------- | -------------------------- |
| `id`        | `Int`     | 自增主键                   |
| `parentId`  | `Int?`    | 父分组 id，`null` 表示根组 |
| `name`      | `String`  | 分组名称                   |
| `active`    | `Boolean` | 是否启用，默认 `true`      |
| `createdAt` | `BigInt`  | 创建时间                   |
| `updatedAt` | `BigInt`  | 更新时间                   |

主键：

- `PRIMARY KEY (id)`

索引：

- `system_document_groups_parent_id_idx`: `(parent_id)`

说明：

- 当前 `parent_id` 是逻辑树关系字段，分组删除由业务层校验：有子分组或有文档时不能删除。
- 分组禁用走业务层级联：禁用父级会同时禁用所有子级；父级禁用时子级不能自行解除禁用。
- 分组列表接口会返回派生字段 `document_count`，表示当前分组直接挂载的系统文档数量，不是数据库列。

### 2.10 `system_documents`

系统知识库文档。

| 字段           | 类型      | 说明                                       |
| -------------- | --------- | ------------------------------------------ |
| `id`           | `Int`     | 自增主键                                   |
| `globalDocId`  | `Int`     | 全局文件 id                                |
| `groupId`      | `Int?`    | 系统知识库分组 id                          |
| `category`     | `String`  | LLM 分类结果：`resume` / `job` / `unknown` |
| `groupName`    | `String`  | 分组名快照，用于列表展示和兼容旧数据       |
| `localName`    | `String`  | 显示名                                     |
| `active`       | `Boolean` | 是否启用                                   |
| `indexStatus`  | `String`  | `pending` / `indexing` / `done` / `failed` |
| `errorMessage` | `String?` | 异步入库失败原因                           |
| `chunksCount`  | `Int`     | 写入 LanceDB 的 chunk 数                   |
| `indexedAt`    | `BigInt?` | 完成向量化时间                             |
| `createdAt`    | `BigInt`  | 创建时间                                   |
| `updatedAt`    | `BigInt`  | 更新时间                                   |

主键：

- `PRIMARY KEY (id)`

外键：

- `global_doc_id -> global_documents.id`
- `group_id -> system_document_groups.id`

索引：

- `system_documents_group_id_idx`: `(group_id)`
- `system_documents_index_status_idx`: `(index_status)`

说明：

- 系统知识库由管理员选择分组上传，接口先创建 `pending` 记录并投递 `system-doc-index` BullMQ 任务。
- Worker 解析文件后调用 LLM 自动分类，再写入 LanceDB 向量库。
- `active` 与所属分组 `active` 共同决定系统知识库检索时是否参与召回；未完成入库的文档不应启用。
- 当前系统知识库不写入 `chunks` 表。
- LanceDB schema 检测和重建由运维脚本处理：版本升级后运行 `pnpm run vector:check-system`，需要时运行 `pnpm run vector:rebuild-system`；server/worker 启动和普通索引任务不做自动重建。

### 2.11 `conversation_summaries`

对话摘要链。

| 字段             | 类型     | 说明        |
| ---------------- | -------- | ----------- |
| `id`             | `Int`    | 自增主键    |
| `conversationId` | `String` | 所属会话    |
| `summary`        | `String` | 摘要内容    |
| `messageCount`   | `Int`    | 覆盖消息数  |
| `startMessageId` | `Int`    | 起始消息 id |
| `endMessageId`   | `Int`    | 结束消息 id |
| `createdAt`      | `BigInt` | 创建时间    |

主键：

- `PRIMARY KEY (id)`

外键：

- `conversation_id -> conversations.id ON DELETE CASCADE`

索引：

- `conversation_summaries_conversation_id_idx`: `(conversation_id)`

## 3. 文件与引用关系

写入链路：

1. 文件进入 `global_documents`
2. 根据使用场景关联到：
   - `conversation_document_refs`
   - `user_documents`
   - `system_documents`
3. 会话内可进一步生成 `chunks`

参考资料显示名：

- 上传参考资料：会话引用保存上传文件名作为 `local_name`。
- 文档库引用参考资料：会话引用保存当时名称快照，并通过 `source_user_document_id` 关联来源文档库记录。
- 消息气泡显示本次发送附件，来自 `messages.attachments`；参考资料面板显示已绑定到会话的引用列表，不依赖前端乐观状态。

删除链路：

1. 先删业务引用
2. 删除会话文档引用时，由 `chunks.ref_id` 外键级联删除该 `refId` 对应的 chunks
3. 查询 `global_document_ref_counts` 视图获取实时引用数量
4. 引用数量归零时清理 `global_documents` 记录和物理文件

这里的引用数量是查询时计算结果，不会回写到 `global_documents`。

## 4. 与消息流相关的字段

`messages.status` 当前语义：

- `streaming`: 正在流式生成
- `completed`: 正常完成
- `interrupted`: 客户端中断，按已生成内容落库

`messages.clientId` 用于把前端消息与后端持久化记录对齐，尤其用于流式 assistant 消息。

## 5. 与 chunk 相关的字段

`chunks.role`、`chunks.category` 和 `chunks.refId` 是当前会话检索与版本恢复的关键字段：

- `role` 表示内容在当前会话里的角色，取值为 `original` / `reference` / `modified`
- `category` 表示内容本身的类型，取值为 `resume` / `job` / `unknown`
- `refId` 用于精确删除、恢复和追踪某一份引用文件对应的 chunks
- `scope` 当前只写入默认值 `conversation`，尚未参与查询过滤、分组或 RAG 路由判断。

命名边界：

- `role` 只表达会话内角色，不表达内容类型。
- `category` 只表达内容类型，不表达会话内角色。
- `system_documents` 不属于某个会话，没有 `role`；它使用 `category` 表达 LLM 分类后的内容类型，使用 `groupId` 关联后台树形分组。
- `groupName` 是系统文档的分组名快照，不是分组关系的唯一来源；关系以 `groupId` 为准。
- 当前系统知识库 RAG 使用 LanceDB，不写入 `chunks` 表；不要把 `admin_document`、`system` 这类来源概念写进 `role`。
- 如果后续把系统知识库 chunk 统一放入 `chunks` 表，应先调整 schema：允许 `conversationId` / `role` 为空，并用 `scope = system` 表达 RAG 域。
