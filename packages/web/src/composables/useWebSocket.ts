import { useWebSocket as _useWebSocket } from '@vueuse/core'
import { ref } from 'vue'
import { getAccessToken } from '@/lib/auth'

const devHost =
  location.hostname === 'localhost' ? '127.0.0.1:3000' : `${location.hostname || '127.0.0.1'}:3000`
const host = import.meta.env.DEV ? devHost : location.host
const proto = location.protocol === 'https:' ? 'wss' : 'ws'

const handlers = new Map<string, Set<(msg: unknown) => void>>()

const wsUrl = ref<string | undefined>()

// 初始化
const token = getAccessToken()
if (token) wsUrl.value = `${proto}://${host}/ws?token=${token}`

const { status, data, close } = _useWebSocket(wsUrl, {
  autoReconnect: { retries: 999, delay: 3000 },
  onConnected() {
    console.log('[WS] Connected')
  },
  onDisconnected() {
    console.log('[WS] Disconnected')
  },
  onMessage(_ws, event) {
    try {
      const msg = JSON.parse(event.data)
      const set = handlers.get(msg.type)
      if (set) for (const h of set) h(msg)
    } catch {
      /* ignore */
    }
  }
})

// 监听登录/登出
if (typeof window !== 'undefined') {
  window.addEventListener('auth-change', () => {
    const t = getAccessToken()
    if (t) {
      wsUrl.value = `${proto}://${host}/ws?token=${t}`
    } else {
      close()
      wsUrl.value = undefined
    }
  })
}

export function useSocket() {
  function on(type: string, handler: (msg: unknown) => void) {
    if (!handlers.has(type)) handlers.set(type, new Set())
    handlers.get(type)!.add(handler)
    return () => {
      handlers.get(type)?.delete(handler)
    }
  }
  return { status, data, on }
}
