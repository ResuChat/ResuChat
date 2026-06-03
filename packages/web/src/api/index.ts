import axios from 'axios'

const service = axios.create({
  baseURL: '/api',
  timeout: 60000
})

service.interceptors.request.use(
  (config) => {
    const phone = localStorage.getItem('login_phone')
    const token = localStorage.getItem('auth_token')
    if (phone) {
      config.headers.set('X-Phone', phone)
    }
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
      config.headers.set('token', token) // 兼容旧版
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

function clearAuth() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('login_phone')
  window.dispatchEvent(new Event('auth-change'))
  import('@/router').then((mod) => mod.default.push('/'))
}

service.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (error.response?.status === 401) {
      clearAuth()
    }
    return Promise.reject(error)
  }
)

export interface Conversation {
  id: string
  user_id: number
  title: string | null
  status: string
  created_at: number
  updated_at: number
}

export interface MessageRecord {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  client_id?: string
  status?: string
  created_at: number
}

export interface DocumentRecord {
  id: number
  conversation_id: string
  file_path: string
  file_url: string
  original_name: string
  file_type: string
  file_size: number
  created_at: number
  docType?: string
}

export interface UserProfile {
  id: number
  phone: string
  nickname: string
  created_at: number
  updated_at: number
}

export interface ConversationsResponse {
  data: Conversation[]
  pagination: { page: number; pageSize: number; total: number }
}

export interface ConversationMessagesResponse {
  data: {
    messages: MessageRecord[]
    documents: DocumentRecord[]
    initialPrompt: string
    title?: string | null
    resumeContent?: string
    originalRefId?: number
  }
  pagination: { page: number; pageSize: number; total: number }
}

export async function getConversations(page = 1, pageSize = 20): Promise<ConversationsResponse> {
  return service.get('/conversations', { params: { page, pageSize } })
}

export async function getConversationMessages(
  id: string,
  page = 1,
  pageSize = 100,
  order: 'ASC' | 'DESC' = 'DESC'
): Promise<ConversationMessagesResponse> {
  return service.get(`/conversations/${id}/messages`, { params: { page, pageSize, order } })
}

export async function getUserProfile(): Promise<UserProfile> {
  return service.get('/user/profile')
}

export async function logout(): Promise<void> {
  return service.post('/auth/logout')
}

export async function deleteConversation(id: string): Promise<void> {
  return service.delete(`/conversations/${id}`)
}

export interface ReferenceDoc {
  id: number
  original_name: string
  file_type: string
  file_size: number
  file_path: string
  doc_type: string
  version: number
  created_at: number
  ref_category?: string
}

export async function getReferenceFiles(conversationId: string): Promise<{ docs: ReferenceDoc[] }> {
  return service.get('/rag/docs', { params: { conversationId } })
}

export async function deleteReferenceFile(conversationId: string, refId: number): Promise<void> {
  return service.delete(`/rag/docs/${refId}`, { params: { conversationId } })
}

export interface DocVersion {
  refId: number
  type: 'original' | 'modified'
  version: number
  fileName: string
  fileSize: number
  createdAt: number
}

export async function getDocHistory(conversationId: string): Promise<{ versions: DocVersion[] }> {
  return service.get(`/rag/docs/${conversationId}/history`)
}

export async function restoreDocVersion(
  refId: number
): Promise<{ message: string; downloadUrl: string; refId: number }> {
  return service.post(`/rag/docs/${refId}/restore`)
}

export async function renderResumePdf(markdown: string): Promise<Blob> {
  const response = await service.post(
    '/rag/render-resume-pdf',
    { markdown },
    { responseType: 'blob' }
  )
  return response as unknown as Blob
}

export { service as api }
