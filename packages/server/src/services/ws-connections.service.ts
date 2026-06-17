import { WebSocket } from 'ws'
import type { UserRole } from '../types/domain'
import type { WsMessage } from './ws-events.service'

const clients = new Map<string, Set<WebSocket>>()
const clientRoles = new Map<string, UserRole>()

export function registerWsClient(userId: string, role: UserRole, ws: WebSocket): number {
  if (!clients.has(userId)) clients.set(userId, new Set())
  clients.get(userId)!.add(ws)
  clientRoles.set(userId, role)
  return clients.get(userId)!.size
}

export function unregisterWsClient(userId: string, ws: WebSocket): number {
  const set = clients.get(userId)
  if (!set) return 0

  set.delete(ws)
  if (set.size === 0) {
    clients.delete(userId)
    clientRoles.delete(userId)
  }
  return set.size
}

export function sendToUser(userId: string, message: WsMessage): void {
  const set = clients.get(userId)
  if (!set || set.size === 0) return
  const data = JSON.stringify(message)
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data)
  }
}

export function sendToRole(role: UserRole, message: WsMessage): void {
  for (const [userId, userRole] of clientRoles.entries()) {
    if (userRole === role) sendToUser(userId, message)
  }
}

export function updateWsClientRole(userId: string, role: UserRole): void {
  if (clients.has(userId)) clientRoles.set(userId, role)
}

export function hasActiveConnection(userId: string): boolean {
  const set = clients.get(userId)
  return !!set && set.size > 0
}

export function closeAllWsConnections(): void {
  for (const set of clients.values()) {
    for (const ws of set) {
      ws.close(1001, 'Server shutdown')
    }
  }
  clients.clear()
  clientRoles.clear()
}
