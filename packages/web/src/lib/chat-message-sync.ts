import type { UIMessage } from 'ai'
import {
  extractMessageContent,
  extractModifications,
  extractOptimizations,
  extractReasoning
} from '@/lib/editor-utils'
import type { Message } from '@/types/chat'

type SdkPart = NonNullable<UIMessage['parts']>[number]

export function getSdkMessageSignature(sdkMsg: UIMessage): string {
  const parts = sdkMsg.parts ?? []
  const textLength = extractMessageContent(sdkMsg).length
  const reasoningLength = extractReasoning(sdkMsg).length
  const partSignature = parts.map((part) => getPartSignature(part)).join('|')
  return [
    sdkMsg.id ?? '',
    sdkMsg.role,
    parts.length,
    textLength,
    reasoningLength,
    partSignature
  ].join('#')
}

export function syncSdkMessageToStore(
  messages: Message[],
  sdkMsg: UIMessage,
  showReasoningMap: Map<string, boolean>
): boolean {
  const content = extractMessageContent(sdkMsg)

  if (!content && sdkMsg.role === 'assistant' && areAllToolParts(sdkMsg.parts ?? [])) {
    const optimizations = extractOptimizations(sdkMsg)
    const modifications = extractModifications(sdkMsg)
    if (optimizations.length === 0 && modifications.length === 0) return false
  }

  const idx = messages.findIndex((message) => message.id === sdkMsg.id)
  const reasoning = extractReasoning(sdkMsg)
  const optimizations = extractOptimizations(sdkMsg)
  const modifications = extractModifications(sdkMsg)

  if (idx >= 0) {
    if (content) messages[idx].content = content
    if (reasoning) messages[idx].reasoning = reasoning
    if (optimizations.length) messages[idx].optimizations = optimizations
    if (modifications.length) messages[idx].modifications = modifications
    return true
  }

  messages.push({
    id: sdkMsg.id ?? '',
    role: sdkMsg.role as 'user' | 'assistant',
    content,
    reasoning,
    showReasoning: showReasoningMap.get(sdkMsg.id ?? '') ?? false,
    optimizations,
    modifications
  })
  return true
}

function getPartSignature(part: SdkPart): string {
  const raw: Record<string, unknown> = isRecord(part) ? part : {}
  const type = typeof raw.type === 'string' ? raw.type : ''
  if (!isToolPartType(type)) return type

  const state = typeof raw.state === 'string' ? raw.state : ''
  const toolCallId = typeof raw.toolCallId === 'string' ? raw.toolCallId : ''
  return [type, state, toolCallId, getToolOutputLength(raw)].join(':')
}

function areAllToolParts(parts: readonly SdkPart[]): boolean {
  return parts.every((part) => {
    const raw: Record<string, unknown> = isRecord(part) ? part : {}
    return typeof raw.type === 'string' && isToolPartType(raw.type)
  })
}

function isToolPartType(type: string): boolean {
  return type === 'dynamic-tool' || type === 'tool-invocation' || type.startsWith('tool-')
}

function getToolOutputLength(raw: Record<string, unknown>): number {
  const toolInvocation = isRecord(raw.toolInvocation) ? raw.toolInvocation : undefined
  const output = raw.output ?? raw.result ?? toolInvocation?.result ?? toolInvocation?.output
  if (output === undefined) return 0
  try {
    return JSON.stringify(output)?.length ?? 0
  } catch {
    return String(output).length
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
