import { normalizeMessageAttachments } from '@resuchat/shared'
import type { OptimizationItem, ModificationItem, Message } from '@/types/chat'

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
    if (output?.optimization) {
      const item = normalizeOptimizationItem(output.optimization)
      if (item) list.push(item)
    }
    if (Array.isArray(output?.optimizations)) {
      for (const value of output.optimizations) {
        const item = normalizeOptimizationItem(value)
        if (item) list.push(item)
      }
    }
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
    const item = normalizeModificationItem(output?.modification)
    if (item) list.push(item)
  }
  return list
}

export function normalizeOptimizationItem(value: unknown): OptimizationItem | null {
  if (!isRecord(value)) {
    console.warn('Ignored invalid optimization item', { reason: 'not_object' })
    return null
  }
  const base = normalizeModificationLike(value, 'optimization')
  if (!base) return null
  if (value.priority !== '高' && value.priority !== '中' && value.priority !== '低') {
    console.warn('Ignored invalid optimization item', { reason: 'invalid_priority' })
    return null
  }
  return { ...base, priority: value.priority }
}

export function normalizeModificationItem(value: unknown): ModificationItem | null {
  if (!isRecord(value)) {
    console.warn('Ignored invalid modification item', { reason: 'not_object' })
    return null
  }
  return normalizeModificationLike(value, 'modification')
}

function normalizeModificationLike(
  value: Record<string, unknown>,
  label: 'optimization' | 'modification'
): ModificationItem | null {
  if (
    !isNonEmptyString(value.field) ||
    !isNonEmptyString(value.current) ||
    !isNonEmptyString(value.suggestion)
  ) {
    console.warn(`Ignored invalid ${label} item`, { reason: 'missing_required_fields' })
    return null
  }
  if (value.reason !== undefined && typeof value.reason !== 'string') {
    console.warn(`Ignored invalid ${label} item`, { reason: 'invalid_reason' })
    return null
  }
  return {
    field: value.field,
    current: value.current,
    suggestion: value.suggestion,
    reason: value.reason
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
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
