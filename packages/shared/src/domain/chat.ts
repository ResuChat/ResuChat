export interface MessageAttachment {
  type: 'reference'
  source: 'upload' | 'library'
  name: string
  refId?: number
  globalDocId?: number
  docId?: number
  fileType?: string
  fileSize?: number
  category?: string
}

export interface MessageRecord {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  client_id?: string
  status?: string
  display_content?: string
  attachments?: MessageAttachment[]
  created_at: number
}

export interface Conversation {
  id: string
  user_id: string
  title: string | null
  status: string
  created_at: number
  updated_at: number
}

export function normalizeMessageAttachments(value: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined

  const attachments = value.flatMap((item): MessageAttachment[] => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    if (raw.type !== 'reference') return []
    if (raw.source !== 'upload' && raw.source !== 'library') return []
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return []

    return [
      {
        type: 'reference',
        source: raw.source,
        name: raw.name,
        refId: optionalPositiveInteger(raw.refId),
        globalDocId: optionalPositiveInteger(raw.globalDocId),
        docId: optionalPositiveInteger(raw.docId),
        fileType: typeof raw.fileType === 'string' ? raw.fileType : undefined,
        fileSize: optionalNonNegativeInteger(raw.fileSize),
        category: typeof raw.category === 'string' ? raw.category : undefined
      }
    ]
  })

  return attachments.length > 0 ? attachments : undefined
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : undefined
}
