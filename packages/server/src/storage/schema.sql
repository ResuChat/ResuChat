-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 登录历史表
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  login_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 会话表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'active',
  initial_prompt TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  reasoning TEXT DEFAULT '',
  client_id TEXT,
  status TEXT DEFAULT 'completed',
  summarized INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 文本块表（RAG）
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  page_content TEXT NOT NULL,
  metadata TEXT,
  source TEXT,
  chunk_index INTEGER NOT NULL,
  doc_type TEXT DEFAULT 'resume',
  ref_id INTEGER,
  scope TEXT DEFAULT 'conversation',
  ref_category TEXT DEFAULT NULL,
  deleted INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 全局文档表（SHA256 去重 + 版本管理）
CREATE TABLE IF NOT EXISTS global_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  reference_count INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- 会话-文档关联表
CREATE TABLE IF NOT EXISTS conversation_document_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  global_doc_id INTEGER NOT NULL,
  doc_type TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  local_name TEXT NOT NULL,
  content_snapshot TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  ref_category TEXT DEFAULT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (global_doc_id) REFERENCES global_documents(id)
);

-- 系统级文档库（用于向量搜索的知识库）
CREATE TABLE IF NOT EXISTS system_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  global_doc_id INTEGER NOT NULL,
  doc_type TEXT NOT NULL CHECK(doc_type IN ('excellent_resume', 'reference_doc')),
  category TEXT NOT NULL,
  local_name TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (global_doc_id) REFERENCES global_documents(id)
);

-- 会话摘要缓存表
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  start_message_id INTEGER NOT NULL,
  end_message_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- 索引
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_order ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chunks_conversation ON chunks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chunks_conv_ref ON chunks(conversation_id, ref_id, deleted);
CREATE INDEX IF NOT EXISTS idx_chunks_conv_deleted_index ON chunks(conversation_id, deleted, chunk_index);
CREATE INDEX IF NOT EXISTS idx_global_docs_hash ON global_documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_conv_doc_refs_conversation ON conversation_document_refs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_doc_refs_global ON conversation_document_refs(global_doc_id);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_conversation ON conversation_summaries(conversation_id);
