import type { OptimizationItem, ModificationItem, Message } from '@/types/chat'

export function getLabel(type: string, payload?: any): string {
  if (type === 'search') return `发送消息：${payload?.text?.slice(0, 20) || '...'}`
  return type === 'apply'
    ? `采纳建议：${payload?.field || ''}`
    : `确认修改：${payload?.field || ''}`
}

export function extractPartsText(parts: any[]): string {
  return (
    parts
      ?.filter((p: any) => p.type === 'text' || p.type === 'text-delta')
      ?.map((p: any) => p.text ?? '')
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

export function extractPartsReasoning(parts: any[]): string {
  return (
    parts
      ?.filter((p: any) => p.type === 'reasoning' || p.type === 'reasoning-delta')
      ?.map((p: any) => p.text ?? '')
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

export function extractPartsOptimizations(parts: any[]): OptimizationItem[] {
  const list: OptimizationItem[] = []
  for (const part of parts?.filter(
    (p: any) => p.type === 'tool-invocation' || p.type?.startsWith('tool-')
  ) ?? []) {
    const output = part.output ?? part.result ?? part.toolInvocation?.result
    if (output?.optimization) list.push(output.optimization)
    if (output?.optimizations) list.push(...output.optimizations)
  }
  return list
}

export function extractPartsModifications(parts: any[]): ModificationItem[] {
  const list: ModificationItem[] = []
  for (const part of parts?.filter(
    (p: any) => p.type === 'tool-invocation' || p.type?.startsWith('tool-')
  ) ?? []) {
    const output = part.output ?? part.result ?? part.toolInvocation?.result
    if (output?.modification) list.push(output.modification)
  }
  return list
}

export function mapApiMessage(m: {
  id?: number | string
  client_id?: string
  role: string
  content: string
  reasoning?: string
  status?: string
}): Message {
  return {
    id: m.client_id || String(m.id ?? ''),
    role: m.role as 'user' | 'assistant',
    content: m.content,
    reasoning: m.reasoning || '',
    showReasoning: false,
    optimizations: [],
    ...(m.status && m.status !== 'completed'
      ? { status: m.status as 'streaming' | 'interrupted' }
      : {})
  }
}
