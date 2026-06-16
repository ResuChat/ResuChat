import { ref, nextTick, type Ref } from 'vue'
import { getConversationMessages } from '@/api'
import type { Message } from '@/types/chat'
import { mapApiMessage } from '@/lib/editor-utils'

const MESSAGES_PAGE_SIZE = 100

interface ChatPanelHistoryHandle {
  getScrollHeight?: () => number
  restoreScrollPosition?: (previousScrollHeight: number) => void
}

export function useEditorHistory(
  messages: Ref<Message[]>,
  conversationId: Ref<string>,
  chatPanelRef: Ref<ChatPanelHistoryHandle | undefined>,
  historyLoading: Ref<boolean>
) {
  const messagesTotal = ref(0)
  const hasMoreHistory = ref(true)
  const canAutoLoad = ref(true)
  const nextCursor = ref<string | null>(null)

  async function loadMoreHistory() {
    if (
      !hasMoreHistory.value ||
      historyLoading.value ||
      !conversationId.value ||
      !canAutoLoad.value
    )
      return
    historyLoading.value = true
    canAutoLoad.value = false

    // 取当前最旧消息的 id 作为游标
    const oldestId = messages.value[0]?.id
    if (!oldestId) {
      historyLoading.value = false
      return
    }

    const prevScrollHeight = chatPanelRef.value?.getScrollHeight?.() ?? 0

    try {
      const result = await getConversationMessages(
        conversationId.value,
        1,
        MESSAGES_PAGE_SIZE,
        'DESC',
        oldestId
      )
      const apiMessages = (result.data?.messages ?? []).reverse()
      if (apiMessages.length === 0) {
        hasMoreHistory.value = false
        return
      }

      nextCursor.value = result.pagination?.nextCursor ?? null
      hasMoreHistory.value = nextCursor.value !== null

      messages.value = [...apiMessages.map(mapApiMessage), ...messages.value]

      await nextTick()
      chatPanelRef.value?.restoreScrollPosition?.(prevScrollHeight)
    } catch (e) {
      console.error('Failed to load more history:', e)
    } finally {
      historyLoading.value = false
    }
  }

  function allowAutoLoad() {
    canAutoLoad.value = true
  }

  function resetHistory(totalMsgs: number) {
    messagesTotal.value = totalMsgs
    hasMoreHistory.value = totalMsgs > messages.value.length
    canAutoLoad.value = true
  }

  return {
    messagesTotal,
    hasMoreHistory,
    loadMoreHistory,
    resetHistory,
    allowAutoLoad
  }
}
