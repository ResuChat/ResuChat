import type {
  AuthTokens,
  Conversation,
  MessageRecord,
  DocumentRecord,
  UserProfile,
  ConversationsResponse,
  ConversationMessagesResponse,
  ReferenceDoc,
  DocVersion,
  SystemDocumentGroup,
  SystemDocumentRecord,
  UserRole,
  UserNotificationRecord,
  UserNotificationsResponse,
  LoginResponse,
  RefreshResponse,
  RegisterResponse
} from '@/types/api'

export type {
  AuthTokens,
  Conversation,
  MessageRecord,
  DocumentRecord,
  UserProfile,
  ConversationsResponse,
  ConversationMessagesResponse,
  ReferenceDoc,
  DocVersion,
  SystemDocumentGroup,
  SystemDocumentRecord,
  UserRole,
  UserNotificationRecord,
  UserNotificationsResponse,
  LoginResponse,
  RefreshResponse,
  RegisterResponse
}
export { api } from './client'
export { login, register, saveAuth, sendEmailCode } from './auth'
export { deleteConversation, getConversationMessages, getConversations } from './conversation'
export {
  deleteReferenceFile,
  getDocHistory,
  getReferenceFiles,
  renderResumePdf,
  restoreDocVersion
} from './document'
export {
  createSystemDocumentGroup,
  deleteSystemDocumentGroup,
  deleteSystemDocument,
  listSystemDocumentGroups,
  listSystemDocuments,
  updateSystemDocumentGroup,
  updateSystemDocumentActive,
  uploadSystemDocument
} from './admin'
export {
  bindPhone,
  changePassword,
  getUserNotifications,
  getUserProfile,
  logout,
  markAllUserNotificationsRead,
  markUserNotificationRead
} from './user'
