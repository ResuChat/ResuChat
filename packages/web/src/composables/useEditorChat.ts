import { watch, type Ref } from 'vue'
import { Chat } from '@ai-sdk/vue'
import type { UIMessage } from 'ai'
import { getConversationMessages } from '@/api'
import { MultipartChatTransport } from '@/lib/multipart-chat-transport'
import { useResumeStore } from '@/stores/resume'
import type { Message, OptimizationItem, ModificationItem } from '@/types/chat'

interface UseEditorChatOptions {
  conversationId: Ref<string>
  requestQueue: Ref<any[]>
  dequeue: () => void
  reloadPdfFromServer: () => Promise<Message[]>
  loadDocHistory: () => Promise<void>
  messages: Ref<Message[]>
  isLoading: Ref<boolean>
  chatError: Ref<string>
  failedMessage: Ref<string>
  autoScroll: Ref<boolean>
  chatPanelRef: Ref<any>
}

export function useEditorChat(options: UseEditorChatOptions) {
  const resumeStore = useResumeStore()
  const showReasoningMap = new Map<string, boolean>()
  let chat!: Chat<any>
  let transport!: MultipartChatTransport<any>
  let chatWatchHandle: (() => void) | null = null

  function extractMessageContent(sdkMsg: UIMessage): string {
    const textParts = sdkMsg.parts?.filter((p: any) => p.type === 'text')
    return (
      textParts
        ?.map((p: any) => p.text ?? p.content ?? '')
        .filter(Boolean)
        .join('\n') ?? ''
    )
  }

  function extractReasoning(sdkMsg: UIMessage): string {
    const reasoningParts = sdkMsg.parts?.filter((p: any) => p.type === 'reasoning')
    return (
      reasoningParts
        ?.map((p: any) => p.text ?? p.reasoning ?? '')
        .filter(Boolean)
        .join('\n') || ''
    )
  }

  function extractModifications(sdkMsg: UIMessage): ModificationItem[] {
    const modList: ModificationItem[] = []
    const toolParts = (sdkMsg.parts?.filter(
      (p: any) =>
        p.type === 'dynamic-tool' || p.type === 'tool-invocation' || p.type?.startsWith('tool-')
    ) ?? []) as any[]
    for (const part of toolParts) {
      const output = part.output ?? part.toolInvocation?.result ?? part.toolInvocation?.output
      if (output?.modification) {
        modList.push(output.modification)
      }
    }
    return modList
  }

  function extractOptimizations(sdkMsg: UIMessage): OptimizationItem[] {
    const optList: OptimizationItem[] = []
    const toolParts = (sdkMsg.parts?.filter(
      (p: any) =>
        p.type === 'dynamic-tool' || p.type === 'tool-invocation' || p.type?.startsWith('tool-')
    ) ?? []) as any[]
    for (const part of toolParts) {
      const output = part.output ?? part.toolInvocation?.result ?? part.toolInvocation?.output
      if (output?.optimization) {
        optList.push(output.optimization)
      }
      if (output?.optimizations) {
        optList.push(...output.optimizations)
      }
    }
    return optList
  }

  const fetchWithAuth: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    const token = localStorage.getItem('auth_token')
    const phone = localStorage.getItem('login_phone')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (phone) headers.set('X-Phone', phone)
    return fetch(input, { ...init, headers })
  }

  function initChat(historyMessages?: any[]) {
    if (chatWatchHandle) {
      chatWatchHandle()
      chatWatchHandle = null
    }

    transport = new MultipartChatTransport({
      fetch: fetchWithAuth
    })

    chat = new Chat({
      transport,
      messages: historyMessages,
      onError: (err: Error) => {
        if (err.message?.includes('reasoning-delta for missing reasoning part')) {
          options.isLoading.value = false
          options.dequeue()
          return
        }
        console.error('Chat error:', err)
        options.chatError.value = err.message || '操作失败'
        options.failedMessage.value = ''
        options.isLoading.value = false
        options.dequeue()
      },
      onFinish: async ({ messages: sdkMessages }: any) => {
        options.isLoading.value = false

        sdkMessages.forEach((msg: any) => {
          if (msg.id && !showReasoningMap.has(msg.id)) showReasoningMap.set(msg.id, false)
        })

        if (
          options.conversationId.value &&
          (options.requestQueue.value[0]?.type === 'apply' ||
            options.requestQueue.value[0]?.type === 'accept')
        ) {
          const dbMessages = await options.reloadPdfFromServer()
          const newDbMsg = dbMessages[0]
          if (newDbMsg?.role === 'assistant') {
            options.messages.value = [...options.messages.value, newDbMsg]
            resumeStore.messages = [...resumeStore.messages, newDbMsg]
          }
          await options.loadDocHistory()
        }

        if (
          options.conversationId.value &&
          options.requestQueue.value[0]?.type === 'search' &&
          !resumeStore.conversationTitle
        ) {
          try {
            const result = await getConversationMessages(options.conversationId.value, 1, 1, 'DESC')
            if (result.data?.title) {
              resumeStore.conversationTitle = result.data.title
            }
          } catch (e) {
            console.error('刷新会话标题失败:', e)
          }
        }

        const newStoreMessages = sdkMessages.map((m: any) => {
          const existing = resumeStore.messages.find((sm: any) => sm.id === m.id)
          return {
            id: m.id ?? '',
            role: m.role as 'user' | 'assistant',
            content: extractMessageContent(m),
            reasoning: existing?.reasoning || extractReasoning(m) || '',
            optimizations: existing?.optimizations || extractOptimizations(m) || [],
            modifications: existing?.modifications || extractModifications(m) || []
          }
        })
        const existingIds = new Set(resumeStore.messages.map((m: any) => m.id))
        for (const m of newStoreMessages) {
          if (existingIds.has(m.id)) continue
          if (!m.content && m.role === 'assistant') {
            const sdkMsg = sdkMessages.find((sm: any) => sm.id === m.id)
            if (
              sdkMsg &&
              (sdkMsg.parts ?? []).every(
                (p: any) => p.type.startsWith('tool-') || p.type === 'dynamic-tool'
              )
            )
              continue
          }
          resumeStore.messages = [...resumeStore.messages, m]
          existingIds.add(m.id)
        }

        options.chatPanelRef.value?.scrollToBottom()
        Promise.resolve().then(() => options.dequeue())
      }
    })

    chatWatchHandle = watch(
      () => chat.messages,
      (sdkMessages) => {
        if (!sdkMessages || sdkMessages.length === 0) return

        for (const sdkMsg of sdkMessages) {
          const content = extractMessageContent(sdkMsg)

          if (!content && sdkMsg.role === 'assistant') {
            const allTool = (sdkMsg.parts ?? []).every(
              (p: any) => p.type.startsWith('tool-') || p.type === 'dynamic-tool'
            )
            if (allTool) continue
          }

          const idx = options.messages.value.findIndex((m) => m.id === sdkMsg.id)
          const reasoning = extractReasoning(sdkMsg)
          const optimizations = extractOptimizations(sdkMsg)
          const modifications = extractModifications(sdkMsg)
          if (idx >= 0) {
            if (content) options.messages.value[idx].content = content
            if (reasoning) options.messages.value[idx].reasoning = reasoning
            if (optimizations.length) options.messages.value[idx].optimizations = optimizations
            if (modifications.length) options.messages.value[idx].modifications = modifications
          } else {
            options.messages.value.push({
              id: sdkMsg.id ?? '',
              role: sdkMsg.role as 'user' | 'assistant',
              content,
              reasoning,
              showReasoning: showReasoningMap.get(sdkMsg.id ?? '') ?? false,
              optimizations,
              modifications
            })
          }
        }

        if (options.autoScroll.value) {
          options.chatPanelRef.value?.scrollToBottom()
        }
      },
      { deep: true }
    )

    if (resumeStore.messages.length > 0) {
      resumeStore.messages.forEach((storeMsg, i) => {
        if ((storeMsg as any).reasoning && options.messages.value[i]) {
          options.messages.value[i].reasoning = (storeMsg as any).reasoning
        }
      })
    }
  }

  return {
    chat,
    transport,
    initChat,
    showReasoningMap,
    extractMessageContent,
    extractReasoning,
    extractModifications,
    extractOptimizations,
    fetchWithAuth
  }
}
