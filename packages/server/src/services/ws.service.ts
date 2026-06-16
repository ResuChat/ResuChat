import { WebSocketServer } from 'ws'
import type { Server } from 'http'
import type Redis from 'ioredis'
import { verifyAccessToken } from './auth.service'
import { getUserRole } from './user.service'
import { logger } from '../lib/logger'
import { redis } from '../lib/redis'
import { WS_EVENTS_CHANNEL, type RoutedWsEvent } from './ws-events.service'
import {
  closeAllWsConnections,
  registerWsClient,
  sendToRole,
  sendToUser,
  unregisterWsClient
} from './ws-connections.service'

let server: WebSocketServer | null = null
let eventSubscriber: Redis | null = null

export function initWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  server = wss
  startEventSubscriber()

  wss.on('error', (error) => {
    logger.error('WebSocket server error', { error })
  })

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const token = url.searchParams.get('token')
    if (!token) {
      ws.close(4001, 'Token required')
      return
    }

    let user: Awaited<ReturnType<typeof verifyAccessToken>>
    let role: Awaited<ReturnType<typeof getUserRole>>
    try {
      user = await verifyAccessToken(token)
      if (!user) {
        ws.close(4001, 'Invalid token')
        return
      }

      role = await getUserRole(user.userId)
      if (!role) {
        ws.close(4001, 'Invalid user')
        return
      }
    } catch (error) {
      logger.warn('WebSocket authentication failed', { error })
      ws.close(4001, 'Invalid token')
      return
    }

    const { userId } = user
    const connectionCount = registerWsClient(userId, role, ws)
    logger.info('WebSocket client connected', {
      userId,
      role,
      connectionCount
    })

    ws.on('close', () => {
      const nextConnectionCount = unregisterWsClient(userId, ws)
      logger.info('WebSocket client disconnected', {
        userId,
        connectionCount: nextConnectionCount
      })
    })

    ws.on('error', () => {}) // ignore transport errors
  })

  logger.info('WebSocket server ready', { path: '/ws' })
  return wss
}

function startEventSubscriber() {
  if (!redis || eventSubscriber) return
  eventSubscriber = redis.duplicate()
  let subscribed = false

  const subscribe = () => {
    if (!eventSubscriber || subscribed || eventSubscriber.status !== 'ready') return
    eventSubscriber
      .subscribe(WS_EVENTS_CHANNEL)
      .then(() => {
        subscribed = true
        logger.info('WebSocket event subscriber ready', { channel: WS_EVENTS_CHANNEL })
      })
      .catch((error) => {
        subscribed = false
        logger.error('WebSocket event subscriber failed', { error })
      })
  }

  eventSubscriber.on('message', (_channel, raw) => {
    try {
      const event = JSON.parse(raw) as RoutedWsEvent
      if (event.target === 'user') {
        sendToUser(event.userId, event.message)
        return
      }
      if (event.target === 'role') {
        sendToRole(event.role, event.message)
      }
    } catch (error) {
      logger.error('WebSocket event dispatch failed', { error })
    }
  })
  eventSubscriber.on('error', (error) => {
    logger.error('WebSocket event subscriber error', { error })
  })
  eventSubscriber.on('ready', subscribe)
  subscribe()
}

export async function closeWebSocketServer(): Promise<void> {
  closeAllWsConnections()

  if (eventSubscriber) {
    await eventSubscriber.quit().catch((error) => {
      logger.error('WebSocket event subscriber close failed', { error })
    })
    eventSubscriber = null
  }

  return new Promise((resolve, reject) => {
    if (!server) {
      resolve()
      return
    }
    server.close((error) => {
      server = null
      if (error) reject(error)
      else resolve()
    })
  })
}
