// Users
export { ensureUser, recordLogin, getUserIdByPhone, getUserByPhone } from './user/users'
export type { User } from './user/users'

// Conversations
export {
  createConversation,
  setInitialPrompt,
  getInitialPrompt,
  updateConversationTitle,
  getConversationTitle,
  deleteConversation,
  restoreConversation,
  restoreConversationWithinTtl,
  isConversationOwner,
  isConversationParticipant,
  getUserConversations,
  getDeletedUserConversations,
  purgeExpiredDeletedConversations,
  getConversationDocuments
} from './conversation/conversations'
export type { Conversation, DeletedConversation, Document } from './conversation/conversations'

// Messages
export {
  buildHistoryPrompt,
  getRecentConversationContextMessages,
  storeMessage,
  storeMessageInTransaction,
  getConversationMessages,
  getMessagesBefore
} from './document/messages'
export type { MessageRecord } from './document/messages'

// Chunks
export {
  getConversationChunks,
  getConversationDocs,
  setConversationChunks,
  setConversationChunksWithTypes,
  setConversationChunksWithTypesInTransaction,
  appendConversationChunks,
  appendConversationChunksInTransaction,
  deleteChunksByRefId,
  getConversationChunksWithTypes
} from './document/chunks'
export type { Chunk, TypedChunk } from './document/chunks'

// Document refs / snapshots
export {
  getLatestConversationResumeSnapshot,
  isConversationDocumentOwner
} from './document/file-manager'

// User documents
export { isUserDocumentOwner } from './user/user-documents'

// Conversation summaries
export { getConversationSummaries } from './conversation/summary-manager'
