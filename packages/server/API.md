# AI Agent BFF API Documentation

Base URL: `http://127.0.0.1:3000`

## Authentication

Most endpoints require authentication. Supported authentication methods:

### Token Header
```
Token: <your-token-here>
```
### Authorization Bearer Header
```
Authorization: Bearer <your-token-here>
```

Both headers are supported. Tokens are obtained via `/auth/login`.

---

## Auth

### POST `/auth/login`

Login with phone number and captcha verification.

#### Request Body
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `phone` | `string` | Yes | Phone number |
| `captcha` | `string` | Yes | Captcha text |
| `key` | `string` | Yes | Captcha session key |

#### Response (200 OK)
```json
{
  "message": "Login successful",
  "token": "uuid-token",
  "username": "user_13800138000"
}
```

### POST `/auth/logout`

Invalidate the current session token.

#### Headers
- `Token`: `<string>` (Required)

#### Response (200 OK)
```json
{
  "message": "Logged out"
}
```

---

## Captcha

### POST `/captcha/generate`

Generate a captcha image.

#### Request Body
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `phone` | `string` | Yes | Phone number (used to generate key) |

#### Response (200 OK)
Content-Type: `image/png`

Returns a PNG image directly. The captcha key is returned in the response header `Captcha-Key`.

#### Errors
- `400` — Phone number required

> **注意**：`Captcha-Key` 是无意义 UUID，手机号存储在服务端（Redis 或内存），不暴露给客户端。

---

## User

### GET `/user/profile`

Get the current user's profile.

#### Headers
- `Token`: `<string>` (Required)

#### Response (200 OK)
```json
{
  "id": 1,
  "phone": "13800138000",
  "nickname": "user_13800138000",
  "created_at": 1700000000000,
  "updated_at": 1700000000000
}
```

#### Errors
- `401` — Token required / Invalid or expired token
- `404` — User not found

---

## Conversations

### GET `/conversations`

Get the current user's conversation list (paginated).

#### Headers
- `Token`: `<string>` (Required)

#### Query Parameters
| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `number` | `1` | Page number |
| `pageSize` | `number` | `20` | Items per page (max 100) |

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "conv_1700000000000_uuid",
      "user_id": 1,
      "title": "简历分析",
      "status": "active",
      "created_at": 1700000000000,
      "updated_at": 1700000000000
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 5
  }
}
```

### GET `/conversations/:id/messages`

Get messages (with reasoning) and bound documents for a conversation.

#### Headers
- `Token`: `<string>` (Required)

#### Path Parameters
| Param | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Conversation ID |

#### Query Parameters
| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `number` | `1` | Page number |
| `pageSize` | `number` | `50` | Items per page (max 200) |
| `order` | `string` | `DESC` | Sort order (`ASC` or `DESC`) |

#### Response (200 OK)
```json
{
  "data": {
    "messages": [
      {
        "id": 1,
        "conversation_id": "conv_1700000000000_uuid",
        "role": "user",
        "content": "请分析这份简历",
        "reasoning": "",
        "created_at": 1700000000000
      },
      {
        "id": 2,
        "conversation_id": "conv_1700000000000_uuid",
        "role": "assistant",
        "content": "好的，我来分析...",
        "reasoning": "第一步：查看简历有哪些字段...第二步：分析技能匹配度...",
        "created_at": 1700000000001
      }
    ],
    "documents": [
      {
        "id": 1,
        "conversation_id": "conv_1700000000000_uuid",
        "file_path": "/path/to/temp/conv_.../resume.pdf",
        "file_url": "/rag/docs/1/download",
        "original_name": "resume.pdf",
        "file_type": "pdf",
        "file_size": 0,
        "created_at": 1700000000000
      }
    ],
    "initialPrompt": "请分析这份简历",
    "title": "简历分析"
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 2
  }
}
```

**注意**：`reasoning` 字段仅在 `role: "assistant"` 的消息中非空。用户消息的 `reasoning` 始终为 `""`。

#### Errors
- `401` — Token required / Invalid or expired token
- `403` — Access denied (conversation not owned by user)
- `404` — User not found

### DELETE `/conversations/:id`

Soft delete a conversation.

#### Headers
- `Token`: `<string>` (Required)

#### Path Parameters
| Param | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Conversation ID |

#### Response (200 OK)
```json
{
  "message": "Conversation deleted"
}
```

#### Errors
- `401` — Token required / Invalid or expired token
- `403` — Access denied (conversation not owned by user)
- `404` — User not found

### POST `/conversations/:id/restore`

Restore a soft-deleted conversation.

#### Headers
- `Token`: `<string>` (Required)

#### Path Parameters
| Param | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Conversation ID |

#### Response (200 OK)
```json
{
  "message": "Conversation restored"
}
```

#### Errors
- `401` — Token required / Invalid or expired token
- `403` — Access denied (conversation not owned by user)
- `404` — User not found

---

## RAG

### POST `/rag/start`

Start a new conversation and upload PDF documents for RAG retrieval.

#### Headers
- `Token`: `<string>` (Required)
- `Content-Type`: `multipart/form-data`

#### Request Body (Form-Data)
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `files` | `File[]` | No | PDF files to upload |
| `query` | `string` | No | Initial query (stored as initial_prompt) |

#### Response (200 OK)
```json
{
  "conversationId": "conv_1700000000000_uuid",
  "initialPrompt": "请分析这份简历"
}
```

### POST `/rag/search`

Stream a response based on the user's query, with dual-tool registration (`updateResume` + `proposeModification`).

#### Headers
- `Token`: `<string>` (Required)
- `Content-Type`: `application/json` (no files) or `multipart/form-data` (with files)

#### Request Body
```json
{
  "conversationId": "conv_1700000000000_uuid",
  "query": "把工作经验改得更详细",
  "messages": [
    { "role": "user", "content": "把工作经验改得更详细" }
  ],
  "k": 5,
  "useSystemDocs": true
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `conversationId` | `string` | No | Conversation ID for context and history |
| `query` | `string` | Yes | User's question (auto-extracted from `messages` if omitted) |
| `messages` | `Message[]` | No | AI SDK UI message format（前端不再发送此字段，历史由 `buildHistoryPrompt` 从数据库获取） |
| `files` | `File[]` | No | Uploaded files (sent as FormData) |
| `k` | `number` | No | Number of chunks to retrieve (default: 4) |
| `useSystemDocs` | `boolean` | No | Include system docs in search (default: true) |

**工具注册**：
- `updateResume` — 当用户询问优化建议时调用
- `proposeModification` — 当用户提出具体修改指令时调用
- 两个工具始终注册，AI 根据描述自选

#### Response (SSE)
Content-Type: `text/event-stream`

Events:
- `text-start`: Response begins.
- `text-delta`: Streaming text chunk (`{ delta: "..." }`).
- `text-end`: Text generation finished.
- `reasoning-delta`: Model thinking process (`{ text: "..." }`).
- `tool-call`: Function tool invocation.
- `finish`: Stream complete (`{ usage: { ... } }`).
- `[DONE]`: End of stream.

### POST `/rag/apply-modification`

Accept a modification suggestion and generate a new PDF. Supports both Scene 1 (apply) and Scene 2 (accept).

#### Headers
- `Token`: `<string>` (Required)
- `Content-Type`: `application/json`

#### Request Body
```json
{
  "conversationId": "conv_1700000000000_uuid",
  "type": "apply",
  "optimization": {
    "field": "工作经验",
    "current": "Developed web apps.",
    "suggestion": "强调全栈开发中的领导力",
    "reason": "建议增加领导力描述,提升简历竞争力"
  }
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `conversationId` | `string` | Yes | Conversation ID |
| `type` | `string` | No | `"apply"`（场景1，根据建议修改）或 `"accept"`（场景2，直接替换） |
| `optimization` | `object` | Yes | 修改内容 |
| `optimization.field` | `string` | Yes | 字段名 |
| `optimization.current` | `string` | Yes | 原文定位锚点（在简历中唯一匹配） |
| `optimization.suggestion` | `string` | Yes | 修改建议/替换内容 |
| `optimization.reason` | `string` | No | 修改原因说明 |

**type 区别**：
| type | 场景 | Prompt Builder |
| :--- | :--- | :--- |
| `apply`（默认） | 采纳建议 | `buildApplyPrompt(fullText, field, current, suggestion, reason)` |
| `accept` | 确认修改 | `buildAcceptPrompt(fullText, field, current, suggestion, reason)` |

**执行流程**：
1. 调用 LLM → 返回 `newContent`
2. `replaceText(fullText, current, newContent)` 四级匹配替换
3. PDF 生成 + 存储 + chunks 更新

**不再使用**：`headingId`、`targetType`、`modifySection`

#### Response (SSE)
Content-Type: `text/event-stream`

Returns SSE with tool events for generateResumePDF, including:
- `tool-input-available`: PDF generation starts
- `tool-output-available`: PDF generated with `{ pdfUrl, fileName, refId }`
- Text stream with modification confirmation

### POST `/rag/upload-pdf`

Upload an updated PDF for a conversation. Used after generating modified resume.

#### Headers
- `Token`: `<string>` (Required)
- `Content-Type`: `multipart/form-data`

#### Request Body (Form-Data)
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `pdf` | `File` | Yes | Updated PDF file |
| `conversationId` | `string` | Yes | Conversation ID |

#### Response (200 OK)
```json
{
  "message": "PDF uploaded successfully"
}
```

#### Errors
- `400` — Missing conversationId or pdf file
- `401` — Token required / Invalid or expired token
- `500` — Internal Server Error

---

## Reference Files

### GET `/rag/docs`

List reference files for a conversation.

#### Headers
- `Token` or `Authorization: Bearer`: `<string>` (Required)

#### Query Parameters
| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `conversationId` | `string` | Yes | Returns conversation reference files |

#### Response
```json
{
  "docs": [
    {
      "id": 1,
      "original_name": "job_description.pdf",
      "file_type": "pdf",
      "file_size": 1024,
      "file_path": "uploads/documents/by_hash/abc123.pdf",
      "doc_type": "reference",
      "version": 1,
      "created_at": 1700000000000,
      "ref_category": "job_description"
    }
  ]
}
```

#### Errors
- `400` — conversationId is required
- `401` — Token required / Invalid or expired token

### DELETE `/rag/docs/:refId`

Delete a reference file from a conversation.

#### Headers
- `Token`: `<string>` (Required)

#### Query Parameters
| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `conversationId` | `string` | Yes | Conversation ID |

#### Response (200 OK)
```json
{
  "message": "Document removed"
}
```

### POST `/rag/docs`

Upload system documentation files.

#### Headers
- `Content-Type`: `multipart/form-data`

#### Request Body (Form-Data)
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `files` | `File[]` | Yes | Files to upload |

### DELETE `/rag/docs/:filename`

Delete a system documentation file.

#### Example
`DELETE /rag/docs/guide.pdf`

### GET `/rag/docs/:refId/download`

Download a conversation document by reference ID.

#### Headers
- `Token`: `<string>` (Required)

#### Response
- `200` — PDF file stream
- `401` — Token required / Invalid or expired token
- `404` — Document not found or file not found on disk

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Bad Request — Missing or invalid parameters |
| `401` | Unauthorized — Token required, invalid, or expired |
| `403` | Forbidden — Access denied (not resource owner) |
| `404` | Not Found — Resource not found |
| `500` | Internal Server Error |
