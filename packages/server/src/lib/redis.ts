import Redis from 'ioredis'
import { REDIS_URL, USE_REDIS } from './config'
import { logger } from './logger'

let redisReady = false
const onReadyCallbacks: Array<() => Promise<void>> = []

export function isRedisReady(): boolean {
  return !!(redis && redisReady && redis.status === 'ready')
}

/** 注册 Redis 重连后的同步回调（auth service 用于将内存数据迁回 Redis） */
export function onRedisReady(cb: () => Promise<void>): void {
  onReadyCallbacks.push(cb)
}

export const redis = USE_REDIS
  ? new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      retryStrategy(times: number): number {
        if (times > 50) return 5000
        return Math.min(times * 200, 3000)
      },
      commandTimeout: 3000,
      enableOfflineQueue: false,
      lazyConnect: false
    })
  : null

if (redis) {
  redis.on('ready', async () => {
    redisReady = true // 先切回 Redis，新请求直接走 Redis
    logger.info('Redis connection ready')
    if (onReadyCallbacks.length > 0) {
      try {
        await Promise.all(onReadyCallbacks.map((cb) => cb()))
        logger.info('Redis in-memory state synced', { callbacks: onReadyCallbacks.length })
      } catch (err) {
        logger.error('Redis sync failed', { error: err })
      }
    }
  })

  redis.on('error', (err) => {
    redisReady = false
    logger.error('Redis error', { error: err })
  })

  redis.on('close', () => {
    redisReady = false
    logger.warn('Redis connection closed, falling back to memory')
  })

  redis.on('reconnecting', () => {
    redisReady = false
    logger.warn('Redis reconnecting, falling back to memory')
  })

  redis.on('end', () => {
    redisReady = false
    logger.warn('Redis connection lost, falling back to memory')
  })
}

export async function closeRedis(): Promise<void> {
  if (!redis) return
  await redis.quit()
}
