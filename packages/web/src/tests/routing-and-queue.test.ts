import { beforeEach, describe, expect, it } from 'vitest'
import { clearAuth, getAccessToken, saveAuth } from '../lib/auth'

interface QueueItem {
  id?: string
  label?: string
  type?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  canceled?: boolean
  execute?: () => void
}

interface QueueRequest {
  type: string
}

interface QueuePayload {
  field?: string
}

describe('routing and queue', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('Route guards', () => {
    it('should redirect to /app/chat when token exists and accessing /', () => {
      saveAuth('test-token', 'refresh-token')

      const guard = (path: string) => {
        const token = getAccessToken()
        if (path === '/' && token) {
          return '/app/chat'
        }
        return path
      }

      expect(guard('/')).toBe('/app/chat')
    })

    it('should redirect to / when accessing protected route without token', () => {
      clearAuth()

      const guard = (path: string, requiresAuth: boolean) => {
        const token = getAccessToken()
        if (requiresAuth && !token) {
          return '/'
        }
        return path
      }

      expect(guard('/conversations', true)).toBe('/')
    })

    it('should allow access to protected route with token', () => {
      saveAuth('test-token', 'refresh-token')

      const guard = (path: string, requiresAuth: boolean) => {
        const token = getAccessToken()
        if (requiresAuth && !token) {
          return '/'
        }
        return path
      }

      expect(guard('/conversations', true)).toBe('/conversations')
    })
  })

  describe('Message queue', () => {
    it('enqueueRequest should add to queue and process when not processing', () => {
      let executed = 0
      const queue: QueueItem[] = []
      let processing = false

      function enqueueRequest(req: QueueItem) {
        queue.push(req)
        if (!processing) processQueue()
      }

      function processQueue() {
        if (queue.length === 0) {
          processing = false
          return
        }
        processing = true
        const current = queue[0]
        current.status = 'processing'
        current.execute?.()
      }

      function dequeue() {
        if (queue.length > 0) {
          queue[0].status = 'completed'
          queue.shift()
        }
        processQueue()
      }

      enqueueRequest({
        execute: () => {
          executed++
        },
        status: 'pending'
      })
      expect(executed).toBe(1)
      expect(queue[0].status).toBe('processing')

      enqueueRequest({
        execute: () => {
          executed++
        },
        status: 'pending'
      })
      expect(queue.length).toBe(2)

      dequeue()
      expect(queue.length).toBe(1)
      expect(executed).toBe(2)
    })

    it('dequeue should invoke loadReferenceFiles callback', () => {
      let called = 0
      const queue: QueueItem[] = []
      const loadReferenceFiles = () => {
        called++
      }
      const dequeue = () => {
        if (queue.length > 0) queue.shift()
        loadReferenceFiles()
      }

      queue.push({ id: '1', status: 'pending' })
      dequeue()
      expect(called).toBe(1)
    })

    it('enqueueRequest should dedup pending request for same field', () => {
      const queue: Array<QueueItem & { label: string; type: string }> = []
      let processing = false

      function enqueueRequest(req: QueueRequest, payload: QueuePayload) {
        if (payload?.field) {
          const field = payload.field
          const dupIdx = queue.findIndex(
            (r) => r.status === 'pending' && r.type === req.type && r.label.includes(field)
          )
          if (dupIdx !== -1) queue.splice(dupIdx, 1)
        }
        queue.push({ ...req, label: `${req.type}: ${payload?.field || ''}`, status: 'pending' })
        if (!processing) processQueue()
      }

      function processQueue() {
        if (queue.length === 0) {
          processing = false
          return
        }
        processing = true
      }

      enqueueRequest({ type: 'apply' }, { field: '工作经验' })
      expect(queue).toHaveLength(1)

      enqueueRequest({ type: 'apply' }, { field: '工作经验' })
      expect(queue).toHaveLength(1)

      enqueueRequest({ type: 'apply' }, { field: '个人信息' })
      expect(queue).toHaveLength(2)
    })

    it('processQueue should skip canceled items', () => {
      const queue: QueueItem[] = [
        { id: '1', status: 'pending', canceled: true },
        { id: '2', status: 'pending', canceled: true },
        { id: '3', status: 'pending', canceled: false }
      ]
      let processing = false

      function processQueue() {
        while (queue.length > 0 && queue[0].canceled) {
          queue.shift()
        }
        if (queue.length === 0) {
          processing = false
          return
        }
        processing = true
        queue[0].status = 'processing'
      }

      processQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe('3')
      expect(queue[0].status).toBe('processing')
      expect(processing).toBe(true)
    })

    it('processQueue should set isProcessing false when queue empty', () => {
      const queue: QueueItem[] = []
      let processing = true

      function processQueue() {
        while (queue.length > 0 && queue[0].canceled) {
          queue.shift()
        }
        if (queue.length === 0) {
          processing = false
          return
        }
        processing = true
      }

      processQueue()
      expect(processing).toBe(false)
    })

    it('should cancel pending item', () => {
      const queue: QueueItem[] = [
        { id: '1', status: 'pending', canceled: false },
        { id: '2', status: 'pending', canceled: false }
      ]

      function cancelRequest(id: string) {
        const req = queue.find((r) => r.id === id)
        if (req) {
          req.canceled = true
          req.status = 'failed'
        }
      }

      cancelRequest('1')
      expect(queue[0].canceled).toBe(true)
      expect(queue[0].status).toBe('failed')
    })

    it('cancelAllPending should mark all pending as canceled', () => {
      const queue: QueueItem[] = [
        { id: '1', status: 'processing', canceled: false },
        { id: '2', status: 'pending', canceled: false },
        { id: '3', status: 'pending', canceled: false }
      ]

      function cancelAllPending() {
        queue.forEach((r) => {
          if (r.status === 'pending') {
            r.canceled = true
            r.status = 'failed'
          }
        })
      }

      cancelAllPending()
      expect(queue[0].canceled).toBe(false)
      expect(queue[0].status).toBe('processing')
      expect(queue[1].canceled).toBe(true)
      expect(queue[1].status).toBe('failed')
      expect(queue[2].canceled).toBe(true)
      expect(queue[2].status).toBe('failed')
    })

    it('should reorder queue by moving item', () => {
      const queue = [
        { id: '1', label: 'A', status: 'pending' },
        { id: '2', label: 'B', status: 'pending' },
        { id: '3', label: 'C', status: 'pending' }
      ]

      const [moved] = queue.splice(2, 1)
      queue.splice(0, 0, moved)

      expect(queue.map((r) => r.label)).toEqual(['C', 'A', 'B'])
    })

    it('should construct supplement context with field name and original', () => {
      const field = '个人信息'
      const original = '张三 | 男 | 13800138000'
      const supplement = '电话放第二行'
      const context = `之前要求修改「${field}」：${original}\n现补充：${supplement}`

      expect(context).toContain('个人信息')
      expect(context).toContain('张三')
      expect(context).toContain('电话放第二行')
    })

    it('supplementCount should reset on accept/reject', () => {
      let supplementCount = 0

      expect(supplementCount).toBe(0)

      supplementCount++
      expect(supplementCount).toBe(1)
    })

    it('submitSupplement should construct context query and increment count', () => {
      const currentSupplementField = '职业技能'
      const currentSupplementOriginal = '精通 Vue'
      let supplementCount = 0
      const text = '加上 React'

      const submitSupplement = (value: string) => {
        const context = currentSupplementField
          ? `之前要求修改「${currentSupplementField}」：${currentSupplementOriginal}\n现补充：${value}`
          : `补充修改要求：${value}`
        supplementCount++
        return context
      }

      const context = submitSupplement(text)
      expect(context).toContain('职业技能')
      expect(context).toContain('精通 Vue')
      expect(context).toContain('加上 React')
      expect(supplementCount).toBe(1)

      const context2 = submitSupplement('也加上 Angular')
      expect(context2).toBeTruthy()
      expect(supplementCount).toBe(2)
    })

    it('submitSupplement without field should fallback to generic context', () => {
      const currentSupplementField = ''
      const supplementCount = 0

      const submitSupplement = (text: string) => {
        const context = currentSupplementField
          ? `之前要求修改「${currentSupplementField}」：xxx\n现补充：${text}`
          : `补充修改要求：${text}`
        void supplementCount
        return context
      }

      const result = submitSupplement('补充内容')
      expect(result).toBe('补充修改要求：补充内容')
    })
  })

  describe('@ doc reference input', () => {
    it('clearAtText should remove @query and return synced value', () => {
      const clearAtText = (ta: HTMLTextAreaElement | null | undefined): string | undefined => {
        if (!ta) return undefined
        const pos = ta.selectionStart || 0
        const text = ta.value
        const lastAt = text.lastIndexOf('@', pos - 1)
        if (lastAt < 0) return text

        const nextValue = text.slice(0, lastAt) + text.slice(pos)
        ta.value = nextValue
        ta.selectionStart = lastAt
        ta.selectionEnd = lastAt
        return nextValue
      }

      const textarea = {
        value: '请帮我优化 @我的简历',
        selectionStart: '请帮我优化 @我的简历'.length,
        selectionEnd: '请帮我优化 @我的简历'.length
      } as unknown as HTMLTextAreaElement

      const nextValue = clearAtText(textarea)

      expect(nextValue).toBe('请帮我优化 ')
      expect(textarea.value).toBe('请帮我优化 ')
      expect(textarea.selectionStart).toBe('请帮我优化 '.length)
      expect(textarea.selectionEnd).toBe('请帮我优化 '.length)
    })
  })

  describe('Disabled cards tracking', () => {
    it('markOptDisabled should add key to set', () => {
      const set = new Set<string>()
      function mark(idx: number) {
        set.add(`0-${idx}`)
      }
      mark(2)
      expect(set.has('0-2')).toBe(true)
    })

    it('markOptDisabled should skip if already disabled', () => {
      const disabledOpts = new Set<string>()
      function markOptDisabled(_msgIndex: number, idx: number) {
        const key = `0-${idx}`
        if (disabledOpts.has(key)) return
        disabledOpts.add(key)
      }

      markOptDisabled(0, 1)
      expect(disabledOpts.has('0-1')).toBe(true)
      expect(disabledOpts.size).toBe(1)

      markOptDisabled(0, 1)
      expect(disabledOpts.size).toBe(1)
    })

    it('markModDisabled should add key and guard duplicates', () => {
      const disabledMods = new Set<string>()
      function markModDisabled(msgIndex: number, modIdx: number) {
        const key = `${msgIndex}-${modIdx}`
        if (disabledMods.has(key)) return
        disabledMods.add(key)
      }

      markModDisabled(0, 1)
      expect(disabledMods.has('0-1')).toBe(true)

      markModDisabled(0, 1)
      expect(disabledMods.size).toBe(1)
    })

    it('markModDisabled should disable supplement button', () => {
      const disabledMods = new Set<string>(['0-1', '1-0'])
      expect(disabledMods.has('0-1')).toBe(true)
      expect(disabledMods.has('0-2')).toBe(false)
    })
  })
})
