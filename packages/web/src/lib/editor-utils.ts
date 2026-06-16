import type { OptimizationItem, ModificationItem, Message, MessageAttachment } from '@/types/chat'

interface MessagePart {
  type?: string
  text?: string
  content?: string
  output?: unknown
  result?: unknown
  toolInvocation?: { result?: unknown; output?: unknown }
}

interface QueuePayload {
  text?: string
  field?: string
}

export function getLabel(type: string, payload?: QueuePayload): string {
  if (type === 'search') return `发送消息：${payload?.text?.slice(0, 20) || '...'}`
  return type === 'apply'
    ? `采纳建议：${payload?.field || ''}`
    : `确认修改：${payload?.field || ''}`
}

/** 从部件数组中提取文本内容 */
export function extractPartsText(parts: MessagePart[] | null | undefined): string {
  return (
    parts
      ?.filter((p) => p.type === 'text' || p.type === 'text-delta')
      ?.map((p) => p.text ?? p.content ?? '')
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

/** 从部件数组中提取推理内容 */
export function extractPartsReasoning(parts: MessagePart[] | null | undefined): string {
  return (
    parts
      ?.filter((p) => p.type === 'reasoning' || p.type === 'reasoning-delta')
      ?.map((p) => p.text ?? '')
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

/** 提取工具调用中的优化建议 */
export function extractPartsOptimizations(
  parts: MessagePart[] | null | undefined
): OptimizationItem[] {
  const list: OptimizationItem[] = []
  for (const part of parts?.filter(isToolPart) ?? []) {
    const output = resolveToolOutput(part)
    if (output?.optimization) list.push(output.optimization as OptimizationItem)
    if (output?.optimizations) list.push(...(output.optimizations as OptimizationItem[]))
  }
  return list
}

/** 提取工具调用中的修改建议 */
export function extractPartsModifications(
  parts: MessagePart[] | null | undefined
): ModificationItem[] {
  const list: ModificationItem[] = []
  for (const part of parts?.filter(isToolPart) ?? []) {
    const output = resolveToolOutput(part)
    if (output?.modification) list.push(output.modification as ModificationItem)
  }
  return list
}

/** 判断是否为工具调用部件 */
function isToolPart(p: MessagePart): boolean {
  return (
    p.type === 'dynamic-tool' ||
    p.type === 'tool-invocation' ||
    (p.type?.startsWith('tool-') ?? false)
  )
}

/** 遍历可能的工具输出路径 */
function resolveToolOutput(part: MessagePart): Record<string, unknown> | undefined {
  const output =
    part.output ?? part.result ?? part.toolInvocation?.result ?? part.toolInvocation?.output
  return isRecord(output) ? output : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function mapApiMessage(m: {
  id?: number | string
  client_id?: string
  role: string
  content: string
  reasoning?: string
  status?: string
  display_content?: string
  attachments?: unknown
}): Message {
  return {
    id: m.client_id || String(m.id ?? ''),
    role: m.role as 'user' | 'assistant',
    content: m.display_content || m.content,
    attachments: normalizeMessageAttachments(m.attachments),
    reasoning: m.reasoning || '',
    showReasoning: false,
    optimizations: [],
    ...(m.status && m.status !== 'completed'
      ? { status: m.status as 'streaming' | 'interrupted' }
      : {})
  }
}

function normalizeMessageAttachments(value: unknown): MessageAttachment[] | undefined {
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

  return attachments.length ? attachments : undefined
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : undefined
}

// ── UIMessage 便捷包装（从 ai-sdk 的 UIMessage 提取内容） ──

export function extractMessageContent(sdkMsg: { parts?: MessagePart[] }): string {
  return extractPartsText(sdkMsg.parts)
}

export function extractReasoning(sdkMsg: { parts?: MessagePart[] }): string {
  return extractPartsReasoning(sdkMsg.parts)
}

export function extractOptimizations(sdkMsg: { parts?: MessagePart[] }): OptimizationItem[] {
  return extractPartsOptimizations(sdkMsg.parts)
}

export function extractModifications(sdkMsg: { parts?: MessagePart[] }): ModificationItem[] {
  return extractPartsModifications(sdkMsg.parts)
}
