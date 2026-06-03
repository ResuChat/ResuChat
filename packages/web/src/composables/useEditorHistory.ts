import { ref, nextTick, type Ref } from 'vue'
import { getConversationMessages } from '@/api'
import type { Message } from '@/types/chat'
import { mapApiMessage } from '@/lib/editor-utils'

const MESSAGES_PAGE_SIZE = 100

export function useEditorHistory(
  messages: Ref<Message[]>,
  conversationId: Ref<string>,
  chatPanelRef: Ref<any>,
  historyLoading: Ref<boolean>
) {
  const messagesPage = ref(1)
  const messagesTotal = ref(0)
  const hasMoreHistory = ref(true)

  async function loadMoreHistory() {
    if (!hasMoreHistory.value || historyLoading.value || !conversationId.value) return
    historyLoading.value = true
    const prevScrollHeight = chatPanelRef.value?.getScrollHeight() ?? 0

    try {
      messagesPage.value++
      const result = await getConversationMessages(
        conversationId.value,
        messagesPage.value,
        MESSAGES_PAGE_SIZE,
        'DESC'
      )
      const apiMessages = (result.data?.messages ?? []).reverse()
      if (apiMessages.length === 0) {
        hasMoreHistory.value = false
        return
      }

      const loadedCount = result.pagination?.total ?? messagesTotal.value
      messagesTotal.value = loadedCount
      hasMoreHistory.value = messages.value.length + apiMessages.length < loadedCount

      messages.value = [...apiMessages.map(mapApiMessage), ...messages.value]

      await nextTick()
      chatPanelRef.value?.restoreScrollPosition(prevScrollHeight)
    } catch (e) {
      console.error('Failed to load more history:', e)
      messagesPage.value--
    } finally {
      historyLoading.value = false
    }
  }

  function resetHistory(totalMsgs: number) {
    messagesPage.value = 1
    messagesTotal.value = totalMsgs
    hasMoreHistory.value = totalMsgs > messages.value.length
  }

  return {
    messagesPage,
    messagesTotal,
    hasMoreHistory,
    loadMoreHistory,
    resetHistory
  }
}
