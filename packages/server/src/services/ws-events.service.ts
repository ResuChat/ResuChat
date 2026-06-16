import { redis } from '../lib/redis'
import { logger } from '../lib/logger'
import type { UserRole } from '../types/domain'

export const WS_EVENTS_CHANNEL = 'resuchat:ws-events'

export type WsMessage = {
  type: string
  payload: Record<string, unknown>
}

export type RoutedWsEvent =
  | { target: 'user'; userId: string; message: WsMessage }
  | { target: 'role'; role: UserRole; message: WsMessage }

export async function publishWsEvent(event: RoutedWsEvent): Promise<void> {
  if (!redis) return
  try {
    await waitRedisReady()
    await redis.publish(WS_EVENTS_CHANNEL, JSON.stringify(event))
  } catch (error) {
    logger.error('WebSocket event publish failed', { error, eventType: event.message.type })
  }
}

function waitRedisReady(timeoutMs = 3000): Promise<void> {
  if (!redis || redis.status === 'ready') return Promise.resolve()
  const client = redis
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Redis is not ready for WebSocket event publish'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      client.off('ready', onReady)
      client.off('error', onError)
      client.off('end', onEnd)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onEnd = () => {
      cleanup()
      reject(new Error('Redis connection ended before WebSocket event publish'))
    }

    client.on('ready', onReady)
    client.on('error', onError)
    client.on('end', onEnd)
  })
}
