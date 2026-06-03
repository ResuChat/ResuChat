import { ChatDeepSeek } from '@langchain/deepseek'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { pipeline } from '@huggingface/transformers'
import pRetry from 'p-retry'
import crypto from 'crypto'
import { redis } from './redis'

export const DEFAULT_MODEL = 'deepseek-v4-pro'

// LangChain 模型（离线调用：摘要/分类/标题/修改）
let _chatModel: ChatDeepSeek | null = null
let _fastModel: ChatDeepSeek | null = null

export function getChatModel(): ChatDeepSeek {
  if (!_chatModel) {
    const raw = new ChatDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: DEFAULT_MODEL
    })
    _chatModel = withRetry(raw)
  }
  return _chatModel
}

export function getFastModel(): ChatDeepSeek {
  if (!_fastModel) {
    const raw = new ChatDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: 'deepseek-v4-flash',
      maxTokens: 8192,
      temperature: 0.1,
      modelKwargs: { thinking: { type: 'disabled' } }
    })
    _fastModel = withRetry(raw)
  }
  return _fastModel
}

function withRetry(model: ChatDeepSeek): ChatDeepSeek {
  const rawInvoke = model.invoke.bind(model)
  model.invoke = (input: any, options?: any) =>
    pRetry(() => rawInvoke(input, options), { retries: 3, factor: 2, minTimeout: 1000 })
  return model
}

// AI SDK 模型（主搜索流：streamText + tools + reasoning）
export const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY
})

// --- 文本向量化（Redis 缓存 + 内存回退） ---

let embedPipe: any = null
let embedLoading: Promise<any> | null = null
const CACHE_TTL = 86400 // Redis TTL: 24h
const MAX_MEM_CACHE = 500
const _memCache = new Map<string, number[]>()

function _hash(text: string): string {
  return 'embed:' + crypto.createHash('sha256').update(text.trim()).digest('hex').substring(0, 16)
}

async function _getFromCache(key: string): Promise<number[] | null> {
  if (redis) {
    try {
      const raw = await redis.get(key)
      if (raw) return JSON.parse(raw)
    } catch {
      /* ignore redis errors */
    }
  }
  return _getFromMem(key)
}

function _getFromMem(key: string): number[] | null {
  const val = _memCache.get(key)
  if (val) {
    _memCache.delete(key)
    _memCache.set(key, val)
  }
  return val ?? null
}

async function _setToCache(key: string, vec: number[]): Promise<void> {
  if (redis) {
    try {
      await redis.setex(key, CACHE_TTL, JSON.stringify(vec))
    } catch {
      /* ignore redis errors */
    }
  }
  if (_memCache.size >= MAX_MEM_CACHE) {
    _memCache.delete(_memCache.keys().next().value!)
  }
  // LRU: delete first, then set to mark as most recently used
  _memCache.delete(key)
  _memCache.set(key, vec)
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!embedPipe) {
    if (!embedLoading) {
      embedLoading = pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5')
    }
    embedPipe = await embedLoading
  }
  const key = _hash(text)
  const cached = await _getFromCache(key)
  if (cached) return cached

  const result = await embedPipe(text, { pooling: 'mean', normalize: true })
  const vec = Array.from(result.data as number[])
  await _setToCache(key, vec)
  return vec
}
