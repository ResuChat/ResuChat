import { ref, computed } from 'vue'
import { getLabel } from '@/lib/editor-utils'

export interface QueuedRequest {
  id: string
  type: 'search' | 'apply' | 'accept'
  label: string
  execute: () => void
  canceled: boolean
  timestamp: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  disabledKey?: string
  wasSupplement?: boolean
}

interface UseRequestQueueDeps {
  loadReferenceFilesRef: { value: () => void }
}

export function useRequestQueue({ loadReferenceFilesRef }: UseRequestQueueDeps) {
  const requestQueue = ref<QueuedRequest[]>([])
  const isProcessing = ref(false)
  const isSearchProcessing = ref(false)

  const pendingQueueCount = computed(
    () => requestQueue.value.filter((r) => r.status === 'pending').length
  )

  function enqueueRequest(
    req: {
      type: 'search' | 'apply' | 'accept'
      execute: () => void
      disabledKey?: string
      wasSupplement?: boolean
    },
    payload?: any
  ) {
    if (payload?.field) {
      const dupIdx = requestQueue.value.findIndex(
        (r) => r.status === 'pending' && r.type === req.type && r.label.includes(payload.field)
      )
      if (dupIdx !== -1) requestQueue.value.splice(dupIdx, 1)
    }
    const newReq: QueuedRequest = {
      ...req,
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: getLabel(req.type, payload),
      status: 'pending',
      canceled: false,
      timestamp: Date.now()
    }
    requestQueue.value.push(newReq)
    setTimeout(() => processQueue(), 0)
  }

  function processQueue() {
    while (requestQueue.value.length > 0 && requestQueue.value[0].canceled) {
      requestQueue.value.shift()
    }
    if (requestQueue.value.length === 0) {
      isProcessing.value = false
      isSearchProcessing.value = false
      return
    }
    const current = requestQueue.value[0]
    if (current.status !== 'pending') return
    isProcessing.value = true
    isSearchProcessing.value = current.type === 'search'
    current.status = 'processing'
    try {
      current.execute()
    } catch (err) {
      console.error('Queue execute error:', err)
      current.status = 'failed'
      requestQueue.value.shift()
      processQueue()
    }
  }

  function dequeue() {
    if (requestQueue.value.length > 0) {
      requestQueue.value[0].status = 'completed'
      requestQueue.value.shift()
    }
    loadReferenceFilesRef.value()
    processQueue()
  }

  function cancelRequest(id: string) {
    const req = requestQueue.value.find((r) => r.id === id)
    if (req) {
      req.canceled = true
      req.status = 'failed'
    }
    return { disabledKey: req?.disabledKey, wasSupplement: req?.wasSupplement }
  }

  function cancelAllPending() {
    const keys: string[] = []
    let drops = 0
    requestQueue.value.forEach((r) => {
      if (r.status === 'pending') {
        r.canceled = true
        r.status = 'failed'
        if (r.disabledKey) keys.push(r.disabledKey)
        if (r.wasSupplement) drops++
      }
    })
    return { keys, drops }
  }

  function onReorderQueue(newQueue: QueuedRequest[]) {
    requestQueue.value = newQueue
  }

  return {
    requestQueue,
    isProcessing,
    isSearchProcessing,
    pendingQueueCount,
    enqueueRequest,
    cancelRequest,
    cancelAllPending,
    dequeue,
    onReorderQueue,
    processQueue
  }
}
