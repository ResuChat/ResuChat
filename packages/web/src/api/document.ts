import { api } from './client'
import type { DocVersion, ReferenceDoc } from '@/types/api'

export async function getReferenceFiles(conversationId: string): Promise<{ docs: ReferenceDoc[] }> {
  return api.get<{ docs: ReferenceDoc[] }, { docs: ReferenceDoc[] }>('/documents', {
    params: { conversationId }
  })
}

export async function deleteReferenceFile(conversationId: string, refId: number): Promise<void> {
  return api.delete<void, void>(`/documents/${refId}`, { params: { conversationId } })
}

export async function getDocHistory(conversationId: string): Promise<{ versions: DocVersion[] }> {
  return api.get<{ versions: DocVersion[] }, { versions: DocVersion[] }>(
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
