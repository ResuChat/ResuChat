import http from 'http'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import app from '../../src/index'
import { signTokens } from '../../src/services/auth.service'
import { ensureUser, createConversation, storeMessage } from '../../src/storage/repository'

type RequestOptions = {
  path: string
  body?: object
  token?: string
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
}

const state = {
  server: undefined as http.Server | undefined,
  serverPort: 0,
  accessToken: '',
  refreshToken: '',
  testPhone: '13800138000',
  testUserId: '',
  testConversationId: ''
}

export function registerApiTestLifecycle() {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      state.server = app.listen(0, () => {
        void (async () => {
          try {
            const address = state.server?.address()
            if (!address || typeof address === 'string') {
              throw new Error('Failed to bind test server')
            }

            state.serverPort = address.port
            state.testUserId = await ensureUser(state.testPhone)
            const tokens = await signTokens(state.testUserId, state.testPhone)
            state.accessToken = tokens.accessToken
            state.refreshToken = tokens.refreshToken
            state.testConversationId = `conv_test_${Date.now()}`
            await createConversation(state.testConversationId, state.testUserId)
            await storeMessage(state.testConversationId, 'user', '请分析这份简历')
            await storeMessage(state.testConversationId, 'assistant', '好的，我来分析...')
            resolve()
          } catch (error) {
            reject(error)
          }
        })()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      state.server?.close(() => resolve())
    })
  })

  beforeEach(async () => {
    const tokens = await signTokens(state.testUserId, state.testPhone)
    state.accessToken = tokens.accessToken
    state.refreshToken = tokens.refreshToken
  })
}

export function getApiTestState() {
  return state
}

export function request(options: RequestOptions): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = options.body ? JSON.stringify(options.body) : ''
    const reqOptions = {
      hostname: 'localhost',
      port: state.serverPort,
      path: options.path,
      method: options.method || (options.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...options.headers
      }
    }

    const req = http.request(reqOptions, (res) => {
      let body = ''
      res.on('data', (chunk) => {
        body += chunk.toString()
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })

    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}
