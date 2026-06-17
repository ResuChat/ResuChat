import 'dotenv/config'
import path from 'path'

/** 必需的环境变量校验 */
function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

/** 集中配置 — 所有可配置常量从 .env 读取，带默认值 */

const SERVER_ROOT = path.resolve(__dirname, '..', '..')

// 安全/部署
export const PORT = parseInt(process.env.PORT || '3000')
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173']
export const JWT_SECRET = requireEnv('JWT_SECRET')
export const DEEPSEEK_API_KEY = requireEnv('DEEPSEEK_API_KEY')
export const JWT_ACCESS_EXPIRY = parseInt(process.env.JWT_ACCESS_EXPIRY || '1800')
export const JWT_REFRESH_EXPIRY = parseInt(process.env.JWT_REFRESH_EXPIRY || '604800')
export const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10')
export const BIND_ADDRESS = process.env.BIND_ADDRESS || '127.0.0.1'
export const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT || '10000')
export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760')
export const BODY_LIMIT = process.env.BODY_LIMIT || '10mb'
export const START_WORKER_IN_SERVER = process.env.START_WORKER_IN_SERVER === 'true'

// Token/验证码
export const CAPTCHA_TTL = parseInt(process.env.CAPTCHA_TTL || '300')
export const EMAIL_CODE_TTL = parseInt(process.env.EMAIL_CODE_TTL || '300')
export const EMAIL_SEND_TIMEOUT = parseInt(process.env.EMAIL_SEND_TIMEOUT || '3000')
export const TOKEN_CLEANUP_INTERVAL = parseInt(process.env.TOKEN_CLEANUP_INTERVAL || '60000')

// SMTP
export const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qq.com'
export const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587')
export const SMTP_USER = process.env.SMTP_USER || ''
export const SMTP_PASS = process.env.SMTP_PASS || ''
export const SMTP_CONNECTION_TIMEOUT = parseInt(process.env.SMTP_CONNECTION_TIMEOUT || '15000')
export const SMTP_GREETING_TIMEOUT = parseInt(process.env.SMTP_GREETING_TIMEOUT || '15000')
export const SMTP_SOCKET_TIMEOUT = parseInt(process.env.SMTP_SOCKET_TIMEOUT || '15000')

// Redis
export const USE_REDIS = process.env.USE_REDIS === 'true'
export const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379')
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined
export const REDIS_URL =
  process.env.REDIS_URL ||
  (() => {
    const auth = REDIS_PASSWORD ? `:${encodeURIComponent(REDIS_PASSWORD)}@` : ''
    return `redis://${auth}${REDIS_HOST}:${REDIS_PORT}`
  })()

// AI/LLM
export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'deepseek-v4-pro'
export const FAST_MODEL = process.env.FAST_MODEL || 'deepseek-v4-flash'
export const FAST_MODEL_MAX_TOKENS = parseInt(process.env.FAST_MODEL_MAX_TOKENS || '8192')
export const FAST_MODEL_TEMPERATURE = parseFloat(process.env.FAST_MODEL_TEMPERATURE || '0.1')
export const LLM_RETRIES = parseInt(process.env.LLM_RETRIES || '3')
export const LLM_RETRY_FACTOR = parseInt(process.env.LLM_RETRY_FACTOR || '2')
export const LLM_RETRY_MIN_TIMEOUT = parseInt(process.env.LLM_RETRY_MIN_TIMEOUT || '1000')
export const AI_MAX_STEPS = parseInt(process.env.AI_MAX_STEPS || '6')
export const AI_STREAM_RETRIES = parseInt(process.env.AI_STREAM_RETRIES || '3')
export const LLM_MARKDOWN_TIMEOUT = parseInt(process.env.LLM_MARKDOWN_TIMEOUT || '120000')
export const DOC_PARSE_TIMEOUT = parseInt(process.env.DOC_PARSE_TIMEOUT || '120000')
export const EMBED_MODEL = process.env.EMBED_MODEL || 'Xenova/bge-small-zh-v1.5'
export const EMBED_CACHE_TTL = parseInt(process.env.EMBED_CACHE_TTL || '86400')
export const EMBED_MEM_CACHE_MAX = parseInt(process.env.EMBED_MEM_CACHE_MAX || '500')
export const EMBED_REMOTE_HOST = (() => {
  const raw = process.env.EMBED_REMOTE_HOST || process.env.HF_ENDPOINT || 'https://hf-mirror.com'
  return raw.endsWith('/') ? raw : `${raw}/`
})()

// 文档处理
export const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || 'uploads/documents/by_hash'
export const DOC_PARSE_MAX_CHARS = parseInt(process.env.DOC_PARSE_MAX_CHARS || '8000')
export const MAX_FILE_VERSIONS = parseInt(process.env.MAX_FILE_VERSIONS || '5')
export const SYSTEM_DOC_MIN_LENGTH = parseInt(process.env.SYSTEM_DOC_MIN_LENGTH || '100')

// 分页/请求
export const MAX_PAGE_SIZE = parseInt(process.env.MAX_PAGE_SIZE || '200')
export const DEFAULT_PAGE_SIZE = parseInt(process.env.DEFAULT_PAGE_SIZE || '20')
export const URL_FETCH_TIMEOUT = parseInt(process.env.URL_FETCH_TIMEOUT || '10000')
export const URL_FETCH_MAX_SIZE = parseInt(process.env.URL_FETCH_MAX_SIZE || '5242880')
export const UPLOAD_TIMEOUT = parseInt(process.env.UPLOAD_TIMEOUT || '240000')
export const DOC_START_TIMEOUT = parseInt(process.env.DOC_START_TIMEOUT || '120000')

// 摘要
export const SUMMARY_TRIGGER_COUNT = parseInt(process.env.SUMMARY_TRIGGER_COUNT || '60')
export const SUMMARY_BATCH_SIZE = parseInt(process.env.SUMMARY_BATCH_SIZE || '40')
export const SUMMARY_MAX_UNCOMPRESSED = parseInt(process.env.SUMMARY_MAX_UNCOMPRESSED || '5')

// 向量库
export const VECTOR_DB_PATH = path.resolve(
  SERVER_ROOT,
  process.env.VECTOR_DB_PATH || 'data/lancedb'
)
export const VECTOR_SEARCH_K = parseInt(process.env.VECTOR_SEARCH_K || '3')
export const VECTOR_DB_TABLE = process.env.VECTOR_DB_TABLE || 'system_chunks'

// PDF 排版
export const PDF_PAGE_WIDTH = parseFloat(process.env.PDF_PAGE_WIDTH || '595.28')
export const PDF_PAGE_HEIGHT = parseFloat(process.env.PDF_PAGE_HEIGHT || '841.89')
export const PDF_MARGIN_TOP = parseInt(process.env.PDF_MARGIN_TOP || '50')
export const PDF_MARGIN_RIGHT = parseInt(process.env.PDF_MARGIN_RIGHT || '40')
export const PDF_MARGIN_BOTTOM = parseInt(process.env.PDF_MARGIN_BOTTOM || '40')
export const PDF_MARGIN_LEFT = parseInt(process.env.PDF_MARGIN_LEFT || '40')

// 其他
export const MERGE_MAX_OVERLAP = parseInt(process.env.MERGE_MAX_OVERLAP || '200')
export const CLASSIFY_MAX_LENGTH = parseInt(process.env.CLASSIFY_MAX_LENGTH || '300')
export const TITLE_MAX_LENGTH = parseInt(process.env.TITLE_MAX_LENGTH || '15')
export const TITLE_MAX_QUERY_LENGTH = parseInt(process.env.TITLE_MAX_QUERY_LENGTH || '200')
export const INTENT_CONTEXT_WINDOW = parseInt(process.env.INTENT_CONTEXT_WINDOW || '4')
export const UPLOAD_PROGRESS_TTL = parseInt(process.env.UPLOAD_PROGRESS_TTL || '30000')
export const CONVERSATION_TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const CONVERSATION_TRASH_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000
export const LOGIN_HISTORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
export const LOGIN_HISTORY_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000
