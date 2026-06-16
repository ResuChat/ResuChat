import { ChatDeepSeek } from '@langchain/deepseek'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { env as hfEnv, pipeline } from '@huggingface/transformers'
import pRetry from 'p-retry'
import crypto from 'crypto'
import { redis } from '../redis'
import { logger } from '../logger'
import {
  DEFAULT_MODEL,
  FAST_MODEL,
  FAST_MODEL_MAX_TOKENS,
  FAST_MODEL_TEMPERATURE,
  LLM_RETRIES,
  LLM_RETRY_FACTOR,
  LLM_RETRY_MIN_TIMEOUT,
  EMBED_MODEL,
  EMBED_CACHE_TTL,
  EMBED_MEM_CACHE_MAX,
  EMBED_REMOTE_HOST
} from '../config'

export { DEFAULT_MODEL } from '../config'

// LangChain 模型（离线调用：摘要/分类/标题/修改）
let _chatModel: ChatDeepSeek | null = null
let _fastModel: ChatDeepSeek | null = null

const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || '120000')

export function getChatModel(): ChatDeepSeek {
  if (!_chatModel) {
    const raw = new ChatDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: DEFAULT_MODEL,
      timeout: LLM_TIMEOUT
    })
    _chatModel = withRetry(raw)
  }
  return _chatModel
}

export function getFastModel(): ChatDeepSeek {
  if (!_fastModel) {
    const raw = new ChatDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: FAST_MODEL,
      maxTokens: FAST_MODEL_MAX_TOKENS,
      temperature: FAST_MODEL_TEMPERATURE,
      timeout: LLM_TIMEOUT,
      modelKwargs: { thinking: { type: 'disabled' } }
    })
    _fastModel = withRetry(raw)
  }
  return _fastModel
}

function withRetry(model: ChatDeepSeek): ChatDeepSeek {
  const rawInvoke: ChatDeepSeek['invoke'] = model.invoke.bind(model)
  const invokeWithRetry: ChatDeepSeek['invoke'] = (input, options) =>
    pRetry(() => rawInvoke(input, options), {
      retries: LLM_RETRIES,
      factor: LLM_RETRY_FACTOR,
      minTimeout: LLM_RETRY_MIN_TIMEOUT
    })
  model.invoke = invokeWithRetry
  return model
}

// AI SDK 模型（主搜索流：streamText + tools + reasoning）
export const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY
})

// --- 文本向量化（Redis 缓存 + 内存回退） ---

interface EmbeddingPipeline {
  (
    text: string,
    options: { pooling: 'mean'; normalize: true }
  ): Promise<{ data: ArrayLike<number> }>
}

let embedPipe: EmbeddingPipeline | null = null
let embedLoading: Promise<unknown> | null = null
let embedRemoteFetchCount = 0
const baseHfFetch = hfEnv.fetch?.bind(hfEnv)
const CACHE_TTL = EMBED_CACHE_TTL
const MAX_MEM_CACHE = EMBED_MEM_CACHE_MAX
const _memCache = new Map<string, number[]>()

function _hash(text: string): string {
  return 'embed:' + crypto.createHash('sha256').update(text.trim()).digest('hex').substring(0, 16)
}

async function _getFromCache(key: string): Promise<number[] | null> {
  if (redis) {
    try {
      const raw = await redis.get(key)
      if (raw) return JSON.parse(raw)
    } catch (e) {
      logger.error('Embedding cache read failed', { error: e })
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
    } catch (e) {
      logger.error('Embedding cache write failed', { error: e })
    }
  }
  if (_memCache.size >= MAX_MEM_CACHE) {
    _memCache.delete(_memCache.keys().next().value!)
  }
  // LRU: delete first, then set to mark as most recently used
  _memCache.delete(key)
  _memCache.set(key, vec)
}

function getEmbeddingPipelineOptions() {
  hfEnv.remoteHost = EMBED_REMOTE_HOST
  if (baseHfFetch) {
    hfEnv.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url
      if (url.startsWith(EMBED_REMOTE_HOST)) {
        embedRemoteFetchCount += 1
      }
      return baseHfFetch(input, init)
    }
  }
  return {}
}

async function ensureEmbeddingPipeline(): Promise<EmbeddingPipeline> {
  if (embedPipe) return embedPipe

  if (!embedLoading) {
    embedRemoteFetchCount = 0
    logger.info('Embedding model loading', { model: EMBED_MODEL, remoteHost: EMBED_REMOTE_HOST })
    embedLoading = pipeline('feature-extraction', EMBED_MODEL, getEmbeddingPipelineOptions()).catch(
      (error) => {
        embedLoading = null
        throw error
      }
    )
  }

  embedPipe = (await embedLoading) as EmbeddingPipeline
  return embedPipe
}

/** 预加载嵌入模型 — 在服务启动时调用，避免首次请求阻塞 */
export async function warmupEmbedding(): Promise<void> {
  await ensureEmbeddingPipeline()
  if (embedRemoteFetchCount > 0) {
    logger.info('Embedding model ready', {
      model: EMBED_MODEL,
      remoteFetchCount: embedRemoteFetchCount,
      cacheHit: false
    })
  } else {
    logger.info('Embedding model ready', {
      model: EMBED_MODEL,
      remoteFetchCount: 0,
      cacheHit: true
    })
  }
}

export async function getEmbedding(text: string): Promise<number[]> {
  const pipe = await ensureEmbeddingPipeline()
  const key = _hash(text)
  const cached = await _getFromCache(key)
  if (cached) return cached

  const result = await pipe(text, { pooling: 'mean', normalize: true })
  const vec = Array.from(result.data as number[])
  await _setToCache(key, vec)
  return vec
}
