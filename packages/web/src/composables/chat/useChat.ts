import { shallowRef, watch, type Ref } from 'vue'
import { Chat } from '@ai-sdk/vue'
import type { UIMessage } from 'ai'
import { getConversationMessages } from '@/api/conversation'
import { MultipartChatTransport } from '@/lib/multipart-chat-transport'
import { useChatStore } from '@/stores/chat.store'
import { attachAuthHeaders } from '@/lib/auth'
import { getSdkMessageSignature, syncSdkMessageToStore } from '@/lib/chat-message-sync'
import {
  extractMessageContent,
  extractReasoning,
  extractOptimizations,
  extractModifications
} from '@/lib/editor-utils'
import type { Message, QueuedRequest } from '@/types/chat'

interface ChatPanelHandle {
  scrollToBottom?: () => void
}

interface UseEditorChatOptions {
  conversationId: Ref<string>
  requestQueue: Ref<QueuedRequest[]>
  dequeue: () => void
  reloadPdfFromServer: () => Promise<Message[]>
  loadDocHistory: () => Promise<void>
  messages: Ref<Message[]>
  isLoading: Ref<boolean>
  chatError: Ref<string>
  failedMessage: Ref<string>
  autoScroll: Ref<boolean>
  chatPanelRef: Ref<ChatPanelHandle | undefined>
}

export function useEditorChat(options: UseEditorChatOptions) {
  const chatStore = useChatStore()
  const showReasoningMap = new Map<string, boolean>()
  const chat = shallowRef<Chat<UIMessage>>()
  let _transport!: MultipartChatTransport<UIMessage>
  let chatWatchHandle: (() => void) | null = null

  const fetchWithAuth: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    attachAuthHeaders(headers)
    return fetch(input, { ...init, headers })
  }

  function initChat(historyMessages?: UIMessage[]) {
    console.log('[initChat] called, historyMessages:', JSON.stringify(historyMessages))
    if (chatWatchHandle) {
      chatWatchHandle()
      chatWatchHandle = null
    }

    _transport = new MultipartChatTransport({
      fetch: fetchWithAuth
    })

    chat.value = new Chat({
      transport: _transport,
      messages: historyMessages ?? [],
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
      onFinish: async ({ messages: sdkMessages }) => {
        options.isLoading.value = false

        sdkMessages.forEach((msg) => {
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
          }
          await options.loadDocHistory()
        }

        if (
          options.conversationId.value &&
          options.requestQueue.value[0]?.type === 'search' &&
          !chatStore.conversationTitle
        ) {
          try {
            const result = await getConversationMessages(options.conversationId.value, 1, 1, 'DESC')
            if (result.data?.title) {
              chatStore.conversationTitle = result.data.title
            }
          } catch (e) {
            console.error('刷新会话标题失败:', e)
          }
        }

        const newStoreMessages = sdkMessages.map((m) => {
          const existing = options.messages.value.find((sm) => sm.id === m.id)
          return {
            id: m.id ?? '',
            role: m.role as 'user' | 'assistant',
            content: extractMessageContent(m),
            reasoning: existing?.reasoning || extractReasoning(m) || '',
            optimizations: existing?.optimizations || extractOptimizations(m) || [],
            modifications: existing?.modifications || extractModifications(m) || []
          }
        })
        const existingIds = new Set(options.messages.value.map((m) => m.id))
        for (const m of newStoreMessages) {
          if (existingIds.has(m.id)) continue
          if (!m.content && m.role === 'assistant') {
            const sdkMsg = sdkMessages.find((sm) => sm.id === m.id)
            if (
              sdkMsg &&
              (sdkMsg.parts ?? []).every(
                (p: object & { type: string }) =>
                  p.type.startsWith('tool-') || p.type === 'dynamic-tool'
              )
            ) {
              // 有卡片产出但无文本回复，用占位文字
              if (m.optimizations?.length || m.modifications?.length) {
                m.content = '（未直接回复文本消息）'
              } else {
                continue
              }
            }
          }
          options.messages.value = [...options.messages.value, m]
          existingIds.add(m.id)
        }

        options.chatPanelRef.value?.scrollToBottom?.()
        Promise.resolve().then(() => options.dequeue())
      }
    })
    console.log('[initChat] Chat instance:', chat.value)
    console.log('[initChat] Chat messages:', chat.value.messages)
    console.log(
      '[initChat] Chat messages type:',
      typeof chat.value.messages,
      Array.isArray(chat.value.messages)
    )

    chatWatchHandle = watch(
      () => {
        const sdkMessages = chat.value?.messages ?? []
        const lastMessage = sdkMessages.at(-1)
        return {
          length: sdkMessages.length,
          lastSignature: lastMessage ? getSdkMessageSignature(lastMessage) : ''
        }
      },
      (signature, previousSignature) => {
        const sdkMessages = chat.value?.messages
        console.log(
          '[chat watch] messages changed, length:',
          sdkMessages?.length,
          'isArray:',
          Array.isArray(sdkMessages)
        )
        if (!sdkMessages || sdkMessages.length === 0) return

        let changed = false
        if (!previousSignature || signature.length !== previousSignature.length) {
          for (const sdkMsg of sdkMessages) {
            changed =
              syncSdkMessageToStore(options.messages.value, sdkMsg, showReasoningMap) || changed
          }
        } else {
          const lastMessage = sdkMessages.at(-1)
          if (lastMessage) {
            changed = syncSdkMessageToStore(options.messages.value, lastMessage, showReasoningMap)
          }
        }

        if (changed && options.autoScroll.value) {
          options.chatPanelRef.value?.scrollToBottom?.()
        }
      }
    )

    if (options.messages.value.length > 0) {
      options.messages.value.forEach((storeMsg, i) => {
        if (storeMsg.reasoning && options.messages.value[i]) {
          options.messages.value[i].reasoning = storeMsg.reasoning
        }
      })
    }
  }

  return {
    chat,
    get transport() {
      return _transport
    },
    initChat,
    showReasoningMap,
    extractMessageContent,
    extractReasoning,
    extractModifications,
    extractOptimizations,
    fetchWithAuth
  }
}
