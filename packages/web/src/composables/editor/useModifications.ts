import { ref, type Ref } from 'vue'
import { generateId } from 'ai'
import { ElMessage } from 'element-plus'
import type { Chat } from '@ai-sdk/vue'
import type { UIMessage } from 'ai'
import type { OptimizationItem, ModificationItem, Message } from '@/types/chat'

const MAX_SUPPLEMENTS = 3

type ChatDeps = Pick<Chat<UIMessage>, 'messages' | 'sendMessage'>

interface EnqueueRequest {
  type: 'search' | 'apply' | 'accept'
  execute: () => void
  disabledKey?: string
  wasSupplement?: boolean
}

interface EnqueuePayload {
  field?: string
  text?: string
}

type EnqueueDeps = (request: EnqueueRequest, payload?: EnqueuePayload) => void

interface ChatPanelHandle {
  scrollToBottom?: () => void
  openSupplementDialog?: () => void
  setInput?: (value: string) => void
}

interface ModificationDeps {
  chat: ChatDeps
  conversationId: string
  enqueueRequest: EnqueueDeps
  isLoading: Ref<boolean>
  dequeue: () => void
}

interface ApplyDeps extends ModificationDeps {
  autoScroll: Ref<boolean>
  chatPanelRef: Ref<ChatPanelHandle | undefined>
}

interface SupplementDeps {
  chat: ChatDeps
  conversationId: string
  enqueueRequest: EnqueueDeps
  isLoading: Ref<boolean>
  chatPanelRef: Ref<ChatPanelHandle | undefined>
}

export function useEditorModifications(messages: Ref<Message[]>) {
  const disabledOpts = ref<Set<string>>(new Set())
  const disabledMods = ref<Set<string>>(new Set())
  const supplementCount = ref(0)
  const currentSupplementField = ref('')
  const currentSupplementOriginal = ref('')
  const lastSupplementText = ref('')
  const currentSupplementMsgIndex = ref(-1)
  const currentSupplementModIdx = ref(-1)
  const pendingSupplementRollback = ref<{
    disabledKey: string
    wasDisabled: boolean
    supplementCount: number
    currentSupplementField: string
    currentSupplementOriginal: string
    lastSupplementText: string
    currentSupplementMsgIndex: number
    currentSupplementModIdx: number
  } | null>(null)

  function markOptDisabled(msgIndex: number, idx: number) {
    disabledOpts.value = new Set(disabledOpts.value).add(`${msgIndex}-${idx}`)
  }

  function markModDisabled(msgIndex: number, modIdx: number) {
    disabledMods.value = new Set(disabledMods.value).add(`${msgIndex}-${modIdx}`)
  }

  function onApplyOptimization(
    item: OptimizationItem,
    idx: number,
    msgIndex: number,
    _msg: Message,
    deps: ApplyDeps
  ) {
    markOptDisabled(msgIndex, idx)
    const userMsgId = generateId()
    const assistantMsgId = generateId()
    const processingId = generateId()
    deps.autoScroll.value = true
    deps.chatPanelRef.value?.scrollToBottom?.()

    deps.enqueueRequest(
      {
        type: 'apply',
        disabledKey: `${msgIndex}-${idx}`,
        execute: () => {
          try {
            deps.chat.messages.push(
              {
                id: userMsgId,
                role: 'user',
                parts: [{ type: 'text', text: `采纳建议：${item.field}` }]
              },
              {
                id: processingId,
                role: 'assistant',
                parts: [{ type: 'text', text: `正在处理「${item.field}」...` }]
              }
            )
            messages.value.push(
              { id: userMsgId, role: 'user', content: `采纳建议：${item.field}` },
              { id: processingId, role: 'assistant', content: `正在处理「${item.field}」...` }
            )
            deps.chat.sendMessage(
              { messageId: userMsgId, parts: [{ type: 'text', text: `采纳建议：${item.field}` }] },
              {
                body: {
                  type: 'apply',
                  conversationId: deps.conversationId,
                  assistantMsgId,
                  clientIds: { user: userMsgId, processing: processingId },
                  optimization: item
                }
              }
            )
          } catch (err) {
            console.error('采纳失败:', err)
            ElMessage.error('采纳失败')
            deps.isLoading.value = false
            deps.dequeue()
          }
        }
      },
      { field: item.field }
    )
  }

  function acceptModification(
    item: ModificationItem,
    msgIndex: number,
    modIdx: number,
    deps: ModificationDeps
  ) {
    markModDisabled(msgIndex, modIdx)
    const userMsgId = generateId()
    const assistantMsgId = generateId()
    const processingId = generateId()
    deps.enqueueRequest(
      {
        type: 'accept',
        disabledKey: `${msgIndex}-${modIdx}`,
        execute: () => {
          try {
            deps.chat.messages.push(
              {
                id: userMsgId,
                role: 'user',
                parts: [{ type: 'text', text: `确认修改：${item.field}` }]
              },
              {
                id: processingId,
                role: 'assistant',
                parts: [{ type: 'text', text: `正在处理「${item.field}」...` }]
              }
            )
            messages.value.push(
              { id: userMsgId, role: 'user', content: `确认修改：${item.field}` },
              { id: processingId, role: 'assistant', content: `正在处理「${item.field}」...` }
            )
            deps.chat.sendMessage(
              { messageId: userMsgId, parts: [{ type: 'text', text: `确认修改：${item.field}` }] },
              {
                body: {
                  type: 'accept',
                  conversationId: deps.conversationId,
                  assistantMsgId,
                  clientIds: { user: userMsgId, processing: processingId },
                  optimization: {
                    field: item.field,
                    current: item.current,
                    suggestion: item.suggestion,
                    reason: item.reason || ''
                  }
                }
              }
            )
          } catch (err) {
            console.error('确认修改失败:', err)
            ElMessage.error('确认修改失败')
            deps.isLoading.value = false
            deps.dequeue()
          }
        }
      },
      { field: item.field }
    )
  }

  function supplementModification(
    item: ModificationItem,
    msgIndex: number,
    modIdx: number,
    chatPanelRef: Ref<ChatPanelHandle | undefined>
  ) {
    if (supplementCount.value >= MAX_SUPPLEMENTS) {
      ElMessage.warning(`最多补充${MAX_SUPPLEMENTS}次`)
      return
    }
    pendingSupplementRollback.value = {
      disabledKey: `${msgIndex}-${modIdx}`,
      wasDisabled: disabledMods.value.has(`${msgIndex}-${modIdx}`),
      supplementCount: supplementCount.value,
      currentSupplementField: currentSupplementField.value,
      currentSupplementOriginal: currentSupplementOriginal.value,
      lastSupplementText: lastSupplementText.value,
      currentSupplementMsgIndex: currentSupplementMsgIndex.value,
      currentSupplementModIdx: currentSupplementModIdx.value
    }
    markModDisabled(msgIndex, modIdx)
    // 构建完整补充链路：原文 → 建议 → 补充 → 建议 → ...
    if (currentSupplementField.value === item.field && lastSupplementText.value) {
      currentSupplementOriginal.value += `\n补充：${lastSupplementText.value}\n建议改为：${item.suggestion}`
    } else {
      currentSupplementOriginal.value = `原文：${item.current}\n建议改为：${item.suggestion}`
      supplementCount.value = 0
    }
    currentSupplementField.value = item.field
    currentSupplementMsgIndex.value = msgIndex
    currentSupplementModIdx.value = modIdx
    chatPanelRef.value?.openSupplementDialog?.()
  }

  function submitSupplement(text: string, deps: SupplementDeps) {
    pendingSupplementRollback.value = null
    lastSupplementText.value = text
    const context = currentSupplementField.value
      ? `之前要求修改「${currentSupplementField.value}」：\n${currentSupplementOriginal.value}\n现补充：${text}`
      : `补充修改要求：${text}`
    const userMsgId = generateId()
    const assistantMsgId = generateId()
    supplementCount.value++
    deps.chatPanelRef.value?.setInput?.('')
    deps.isLoading.value = true
    deps.enqueueRequest(
      {
        type: 'search',
        wasSupplement: true,
        disabledKey: `${currentSupplementMsgIndex.value}-${currentSupplementModIdx.value}`,
        execute: () => {
          deps.chat.messages.push({
            id: userMsgId,
            role: 'user',
            parts: [{ type: 'text', text: `补充修改要求：${text}` }]
          })
          deps.chat.sendMessage(
            { messageId: userMsgId, parts: [{ type: 'text', text: `补充修改要求：${text}` }] },
            {
              body: {
                conversationId: deps.conversationId,
                query: context,
                displayText: `补充修改要求：${text}`,
                userMsgId,
                assistantMsgId
              }
            }
          )
        }
      },
      { text: context }
    )
  }

  function rejectModification(msgIndex: number, modIdx: number) {
    supplementCount.value = 0
    markModDisabled(msgIndex, modIdx)
  }

  function cleanupDisabledKeys(keys: string[]) {
    disabledOpts.value = new Set([...disabledOpts.value].filter((k) => !keys.includes(k)))
    disabledMods.value = new Set([...disabledMods.value].filter((k) => !keys.includes(k)))
  }

  function cancelSupplement() {
    const rollback = pendingSupplementRollback.value
    if (!rollback) return
    if (!rollback.wasDisabled) cleanupDisabledKeys([rollback.disabledKey])
    supplementCount.value = rollback.supplementCount
    currentSupplementField.value = rollback.currentSupplementField
    currentSupplementOriginal.value = rollback.currentSupplementOriginal
    lastSupplementText.value = rollback.lastSupplementText
    currentSupplementMsgIndex.value = rollback.currentSupplementMsgIndex
    currentSupplementModIdx.value = rollback.currentSupplementModIdx
    pendingSupplementRollback.value = null
  }

  function resetSupplement() {
    supplementCount.value = 0
    currentSupplementField.value = ''
    currentSupplementOriginal.value = ''
    lastSupplementText.value = ''
    currentSupplementMsgIndex.value = -1
    currentSupplementModIdx.value = -1
    pendingSupplementRollback.value = null
  }

  return {
    disabledOpts,
    disabledMods,
    supplementCount,
    currentSupplementField,
    currentSupplementOriginal,
    currentSupplementMsgIndex,
    currentSupplementModIdx,
    markOptDisabled,
    markModDisabled,
    onApplyOptimization,
    acceptModification,
    supplementModification,
    submitSupplement,
    cancelSupplement,
    rejectModification,
    cleanupDisabledKeys,
    resetSupplement
  }
}
