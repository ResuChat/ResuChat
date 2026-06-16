import { z } from 'zod'
import { PaginationQuery } from './common.dto'

const MessageAttachment = z.object({
  type: z.literal('reference'),
  source: z.enum(['upload', 'library']),
  name: z.string(),
  refId: z.number().optional(),
  globalDocId: z.number().optional(),
  docId: z.number().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().optional(),
  category: z.string().optional()
})

/** 消息记录 */
export const MessageRecord = z.object({
  id: z.number(),
  conversation_id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  reasoning: z.string().optional(),
  client_id: z.string().optional(),
  status: z.string().optional(),
  display_content: z.string().optional(),
  attachments: z.array(MessageAttachment).optional(),
  created_at: z.number()
})

export type MessageRecord = z.infer<typeof MessageRecord>

/** 文档记录 */
export const DocumentRecord = z.object({
  id: z.number(),
  conversation_id: z.string(),
  file_path: z.string(),
  file_url: z.string(),
  original_name: z.string(),
  local_name: z.string().optional(),
  source_user_document_id: z.number().nullable().optional(),
  file_type: z.string(),
  file_size: z.number(),
  created_at: z.number(),
  role: z.string()
})

export type DocumentRecord = z.infer<typeof DocumentRecord>

/** 会话消息响应 */
export const MessagesResponse = z.object({
  messages: z.array(MessageRecord),
  documents: z.array(DocumentRecord),
  initialPrompt: z.string().nullable(),
  title: z.string().nullable(),
  resumeContent: z.string(),
  originalRefId: z.number()
})

export type MessagesResponse = z.infer<typeof MessagesResponse>

/** 会话列表项 */
export const ConversationListItem = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  created_at: z.number(),
  updated_at: z.number()
})

export type ConversationListItem = z.infer<typeof ConversationListItem>

/** GET /conversations 查询参数 */
export const ConversationsQuery = PaginationQuery

export type ConversationsQuery = z.infer<typeof ConversationsQuery>

/** GET /conversations/:id/messages 查询参数 */
export const MessagesQuery = PaginationQuery.extend({
  order: z.enum(['ASC', 'DESC']).optional().default('DESC'),
  before: z.string().optional()
})

export type MessagesQuery = z.infer<typeof MessagesQuery>

/** POST /conversations/start 请求 */
export const StartConversationRequest = z.object({
  conversationId: z
    .string()
    .regex(/^conv_\d+_[a-z0-9-]{6,36}$/i)
    .optional(),
  query: z.string().trim().optional().default(''),
  docId: z.coerce.number().int().positive().optional()
})

export type StartConversationRequest = z.infer<typeof StartConversationRequest>

/** POST /conversations/start 响应 */
export const StartResponse = z.object({
  conversationId: z.string(),
  initialPrompt: z.string(),
  resumeContent: z.string(),
  originalRefId: z.number()
})

export type StartResponse = z.infer<typeof StartResponse>
