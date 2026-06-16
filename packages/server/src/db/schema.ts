import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  serial,
  text,
  uniqueIndex,
  bigint
} from 'drizzle-orm/pg-core'
import type { MessageAttachment } from '../types/domain'

export const messageRole = pgEnum('MessageRole', ['user', 'assistant'])

const millis = (name: string) => bigint(name, { mode: 'number' })

export const users = pgTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    phone: text('phone'),
    email: text('email'),
    password: text('password'),
    nickname: text('nickname').notNull(),
    role: text('role').notNull().default('normal'),
    avatar: text('avatar'),
    createdAt: millis('created_at').notNull(),
    updatedAt: millis('updated_at').notNull()
  },
  (table) => [
    uniqueIndex('users_phone_key').on(table.phone),
    uniqueIndex('users_email_key').on(table.email)
  ]
)

export const loginHistory = pgTable(
  'login_history',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    loginAt: millis('login_at').notNull()
  },
  (table) => [index('login_history_user_id_idx').on(table.userId)]
)

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    status: text('status').notNull().default('active'),
    initialPrompt: text('initial_prompt'),
    createdAt: millis('created_at').notNull(),
    updatedAt: millis('updated_at').notNull(),
    deletedAt: millis('deleted_at')
  },
  (table) => [
    index('conversations_user_id_idx').on(table.userId),
    index('conversations_user_id_updated_at_idx').on(table.userId, table.updatedAt.desc())
  ]
)

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, {
        onDelete: 'cascade'
      }),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    reasoning: text('reasoning').notNull().default(''),
    clientId: text('client_id'),
    status: text('status').notNull().default('completed'),
    summarized: boolean('summarized').notNull().default(false),
    displayContent: text('display_content'),
    attachments: jsonb('attachments').$type<MessageAttachment[]>(),
    createdAt: millis('created_at').notNull()
  },
  (table) => [
    index('messages_conversation_id_idx').on(table.conversationId),
    index('messages_conversation_id_created_at_idx').on(table.conversationId, table.createdAt),
    index('messages_client_id_idx').on(table.clientId)
  ]
)

export const chunks = pgTable(
  'chunks',
  {
    id: serial('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, {
        onDelete: 'cascade'
      }),
    pageContent: text('page_content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    source: text('source'),
    chunkIndex: integer('chunk_index').notNull(),
    role: text('role').notNull().default('original'),
    refId: integer('ref_id').references(() => conversationDocumentRefs.id, {
      onDelete: 'cascade'
    }),
    scope: text('scope').notNull().default('conversation'),
    category: text('category').notNull().default('resume'),
    createdAt: millis('created_at').notNull()
  },
  (table) => [
    index('chunks_conversation_id_idx').on(table.conversationId),
    index('chunks_conversation_id_ref_id_idx').on(table.conversationId, table.refId),
    index('chunks_conversation_id_chunk_index_idx').on(table.conversationId, table.chunkIndex)
  ]
)

export const globalDocuments = pgTable(
  'global_documents',
  {
    id: serial('id').primaryKey(),
    fileHash: text('file_hash').notNull(),
    filePath: text('file_path').notNull(),
    originalName: text('original_name').notNull(),
    fileType: text('file_type').notNull(),
    fileSize: integer('file_size').notNull(),
    createdAt: millis('created_at').notNull()
  },
  (table) => [uniqueIndex('global_documents_file_hash_key').on(table.fileHash)]
)

export const userDocuments = pgTable(
  'user_documents',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    globalDocId: integer('global_doc_id')
      .notNull()
      .references(() => globalDocuments.id),
    localName: text('local_name').notNull(),
    source: text('source').notNull().default('upload'),
    parseStatus: text('parse_status').notNull().default('pending'),
    category: text('category').notNull().default('unknown'),
    markdownContent: text('markdown_content'),
    createdAt: millis('created_at').notNull()
  },
  (table) => [
    uniqueIndex('user_documents_user_id_global_doc_id_key').on(table.userId, table.globalDocId),
    index('user_documents_user_id_idx').on(table.userId)
  ]
)

export const conversationDocumentRefs = pgTable(
  'conversation_document_refs',
  {
    id: serial('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, {
        onDelete: 'cascade'
      }),
    globalDocId: integer('global_doc_id')
      .notNull()
      .references(() => globalDocuments.id),
    role: text('role').notNull(),
    version: integer('version').notNull().default(1),
    localName: text('local_name').notNull(),
    sourceUserDocumentId: integer('source_user_document_id').references(() => userDocuments.id, {
      onDelete: 'set null'
    }),
    contentSnapshot: text('content_snapshot'),
    createdAt: millis('created_at').notNull(),
    category: text('category').notNull().default('unknown')
  },
  (table) => [
    index('conversation_document_refs_conversation_id_idx').on(table.conversationId),
    index('conversation_document_refs_global_doc_id_idx').on(table.globalDocId),
    index('conversation_document_refs_source_user_document_id_idx').on(table.sourceUserDocumentId)
  ]
)

export const systemDocumentGroups = pgTable(
  'system_document_groups',
  {
    id: serial('id').primaryKey(),
    parentId: integer('parent_id'),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: millis('created_at').notNull(),
    updatedAt: millis('updated_at').notNull()
  },
  (table) => [index('system_document_groups_parent_id_idx').on(table.parentId)]
)

export const systemDocuments = pgTable(
  'system_documents',
  {
    id: serial('id').primaryKey(),
    globalDocId: integer('global_doc_id')
      .notNull()
      .references(() => globalDocuments.id),
    groupId: integer('group_id').references(() => systemDocumentGroups.id),
    category: text('category').notNull().default('unknown'),
    groupName: text('group_name').notNull(),
    localName: text('local_name').notNull(),
    active: boolean('active').notNull().default(true),
    indexStatus: text('index_status').notNull().default('pending'),
    errorMessage: text('error_message'),
    chunksCount: integer('chunks_count').notNull().default(0),
    indexedAt: millis('indexed_at'),
    createdAt: millis('created_at').notNull(),
    updatedAt: millis('updated_at').notNull()
  },
  (table) => [
    index('system_documents_group_id_idx').on(table.groupId),
    index('system_documents_index_status_idx').on(table.indexStatus)
  ]
)

export const conversationSummaries = pgTable(
  'conversation_summaries',
  {
    id: serial('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, {
        onDelete: 'cascade'
      }),
    summary: text('summary').notNull(),
    messageCount: integer('message_count').notNull(),
    startMessageId: integer('start_message_id').notNull(),
    endMessageId: integer('end_message_id').notNull(),
    createdAt: millis('created_at').notNull()
  },
  (table) => [index('conversation_summaries_conversation_id_idx').on(table.conversationId)]
)

export const globalDocumentRefCounts = pgView('global_document_ref_counts', {
  globalDocId: integer('global_doc_id'),
  referenceCount: integer('reference_count')
}).existing()
