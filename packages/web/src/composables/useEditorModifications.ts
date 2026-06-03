import { ref, type Ref } from 'vue'
import { generateId } from 'ai'
import { ElMessage } from 'element-plus'
import type { OptimizationItem, ModificationItem, Message } from '@/types/chat'

const MAX_SUPPLEMENTS = 3

interface ChatDeps {
  messages: any[]
  sendMessage: (..._: any[]) => void
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type EnqueueDeps = (..._: any[]) => void

interface ModificationDeps {
  chat: ChatDeps
  conversationId: string
  enqueueRequest: EnqueueDeps
  isLoading: Ref<boolean>
  dequeue: () => void
}

interface ApplyDeps extends ModificationDeps {
  autoScroll: Ref<boolean>
  chatPanelRef: Ref<any>
}

interface SupplementDeps {
  chat: ChatDeps
  conversationId: string
  enqueueRequest: EnqueueDeps
  isLoading: Ref<boolean>
  chatPanelRef: Ref<any>
}

export function useEditorModifications(messages: Ref<Message[]>) {
  const disabledOpts = ref<Set<string>>(new Set())
  const disabledMods = ref<Set<string>>(new Set())
  const supplementCount = ref(0)
  const currentSupplementField = ref('')
  const currentSupplementOriginal = ref('')
  const currentSupplementMsgIndex = ref(-1)
  const currentSupplementModIdx = ref(-1)

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
    deps.chatPanelRef.value?.scrollToBottom()

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
    chatPanelRef: Ref<any>
  ) {
    if (supplementCount.value >= MAX_SUPPLEMENTS) {
      ElMessage.warning(`最多补充${MAX_SUPPLEMENTS}次`)
      return
    }
    markModDisabled(msgIndex, modIdx)
    currentSupplementField.value = item.field
    currentSupplementOriginal.value = item.suggestion
    currentSupplementMsgIndex.value = msgIndex
    currentSupplementModIdx.value = modIdx
    chatPanelRef.value?.openSupplementDialog()
  }

  function submitSupplement(text: string, deps: SupplementDeps) {
    const context = currentSupplementField.value
      ? `之前要求修改「${currentSupplementField.value}」：${currentSupplementOriginal.value}\n现补充：${text}`
      : `补充修改要求：${text}`
    const userMsgId = generateId()
    const assistantMsgId = generateId()
    supplementCount.value++
    deps.chatPanelRef.value?.setInput('')
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

  function resetSupplement() {
    supplementCount.value = 0
    currentSupplementField.value = ''
    currentSupplementOriginal.value = ''
    currentSupplementMsgIndex.value = -1
    currentSupplementModIdx.value = -1
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
    rejectModification,
    cleanupDisabledKeys,
    resetSupplement
  }
}
