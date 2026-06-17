// Domain types
export type { UserRole } from './domain/user'

export type {
  DocumentCategory,
  ConversationDocumentRole,
  DocumentRecord,
  ReferenceDoc,
  DocVersion
} from './domain/document'
export { normalizeDocumentCategory } from './domain/document'

export type { MessageAttachment, MessageRecord, Conversation } from './domain/chat'
export { normalizeMessageAttachments } from './domain/chat'

// API contract types
export type { AuthTokens, RegisterResponse, LoginResponse, RefreshResponse } from './api/auth'

export type { ConversationsResponse, ConversationMessagesResponse } from './api/conversation'

export type { UserProfile, UserNotificationRecord, UserNotificationsResponse } from './api/user'

export type { SystemDocumentRecord, SystemDocumentGroup } from './api/system-knowledge'
