const DEFAULT_START_PROMPT = '请分析这份简历'
const DEFAULT_REFERENCE_ANALYSIS_PROMPT = '请分析所附资料'

export interface ScrollPayload {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export function resolveStartConversationQuery(prompt: string): string {
  return prompt.trim() || DEFAULT_START_PROMPT
}

export function resolveSearchQuery(
  text: string,
  options?: { hasFiles?: boolean; hasDocs?: boolean }
): string {
  const normalized = text.trim()
  if (normalized) return normalized
  if (options?.hasFiles || options?.hasDocs) return DEFAULT_REFERENCE_ANALYSIS_PROMPT
  return ''
}

export function shouldLoadMoreHistory(
  payload: ScrollPayload,
  options: { scrollReady: boolean; hasMoreHistory: boolean }
): boolean {
  const isNearBottom = payload.scrollHeight - payload.scrollTop - payload.clientHeight < 80
  return options.scrollReady && !isNearBottom && options.hasMoreHistory && payload.scrollTop < 30
}
