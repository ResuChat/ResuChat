import { api } from './client'
import type { DocVersion, ReferenceDoc } from '@/types/api'

export async function getReferenceFiles(conversationId: string): Promise<{ data: ReferenceDoc[] }> {
  return api.get<{ data: ReferenceDoc[] }, { data: ReferenceDoc[] }>('/documents', {
    params: { conversationId }
  })
}

export async function deleteReferenceFile(conversationId: string, refId: number): Promise<void> {
  return api.delete<void, void>(`/documents/${refId}`, { params: { conversationId } })
}

export async function getDocHistory(conversationId: string): Promise<{ data: DocVersion[] }> {
  return api.get<{ data: DocVersion[] }, { data: DocVersion[] }>(
    `/documents/${conversationId}/history`
  )
}

export async function restoreDocVersion(
  refId: number
): Promise<{ message: string; downloadUrl: string; refId: number }> {
  return api.post<
    { message: string; downloadUrl: string; refId: number },
    { message: string; downloadUrl: string; refId: number }
  >(`/documents/${refId}/restore`)
}

export async function renderResumePdf(markdown: string): Promise<Blob> {
  const response = await api.post('/modify/render-pdf', { markdown }, { responseType: 'blob' })
  return response as unknown as Blob
}
