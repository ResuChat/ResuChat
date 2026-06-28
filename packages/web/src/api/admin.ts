import { api } from './client'
import type { SystemDocumentGroup, SystemDocumentRecord } from '@/types/api'

export async function listSystemDocuments(): Promise<{ data: SystemDocumentRecord[] }> {
  return api.get<{ data: SystemDocumentRecord[] }, { data: SystemDocumentRecord[] }>(
    '/admin/system-documents'
  )
}

export async function uploadSystemDocument(formData: FormData): Promise<{
  message: string
  data: {
    globalDocId: number
    systemDocId: number
    jobId: string
    indexStatus: 'pending' | 'indexing' | 'done' | 'failed'
  }
}> {
  return api.post('/admin/system-documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export async function deleteSystemDocument(id: number): Promise<void> {
  return api.delete(`/admin/system-documents/${id}`)
}

export async function updateSystemDocumentActive(
  id: number,
  active: boolean
): Promise<{ data: { id: number; active: boolean } }> {
  return api.patch(`/admin/system-documents/${id}`, { active: active ? 1 : 0 })
}

export async function listSystemDocumentGroups(): Promise<{ data: SystemDocumentGroup[] }> {
  return api.get<{ data: SystemDocumentGroup[] }, { data: SystemDocumentGroup[] }>(
    '/admin/system-document-groups'
  )
}

export async function createSystemDocumentGroup(data: {
  name: string
  parentId: number | null
}): Promise<{ data: SystemDocumentGroup }> {
  return api.post('/admin/system-document-groups', data)
}

export async function updateSystemDocumentGroup(
  id: number,
  data: { name?: string; parentId?: number | null; active?: boolean }
): Promise<{ data: SystemDocumentGroup }> {
  return api.patch(`/admin/system-document-groups/${id}`, data)
}

export async function deleteSystemDocumentGroup(id: number): Promise<void> {
  return api.delete(`/admin/system-document-groups/${id}`)
}
