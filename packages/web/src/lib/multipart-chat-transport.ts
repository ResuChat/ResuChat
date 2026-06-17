import type { ChatTransport, UIMessageChunk, UIMessage } from 'ai'
import { parseJsonEventStream } from 'ai'
import { z } from 'zod'
import { getAccessToken } from '@/lib/auth'

export class MultipartChatTransport<
  UI_MESSAGE extends UIMessage
> implements ChatTransport<UI_MESSAGE> {
  private fetchImpl: typeof fetch
  private _abortController: AbortController | null = null

  constructor({ fetch: customFetch }: { api?: string; fetch?: typeof fetch }) {
    this.fetchImpl = customFetch || fetch
  }

  /** 停止当前流式请求并清空队列 */
  stop() {
    this._abortController?.abort()
    this._abortController = null
  }

  async sendMessages(options: {
    chatId: string
    messages: UI_MESSAGE[]
    trigger: 'submit-message' | 'regenerate-message'
    messageId: string | undefined
    abortSignal: AbortSignal | undefined
    body?: object
  }): Promise<ReadableStream<UIMessageChunk>> {
    const body = getBodyRecord(options.body)
    const api =
      body?.type === 'apply' || body?.type === 'accept' ? '/api/modify/apply' : '/api/chat/search'

    const files = getBodyFiles(body)
    const hasFiles = files.length > 0
    const token = getAccessToken()
    const headers: Record<string, string> = {
      ...(token ? { token } : {})
    }

    this._abortController = new AbortController()

    let response: Response

    if (hasFiles) {
      const formData = new FormData()
      formData.append('chatId', options.chatId)
      formData.append('trigger', options.trigger)
      if (options.messageId) {
        formData.append('messageId', options.messageId)
      }
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && key !== 'files') {
          formData.append(key, typeof value === 'string' ? value : JSON.stringify(value))
        }
      }
      for (const file of files) {
        formData.append('files', file, file.name)
      }

      response = await this.fetchImpl(api, {
        method: 'POST',
        body: formData,
        signal: this._abortController.signal,
        headers
      })
    } else {
      const jsonBody: Record<string, unknown> = {
        chatId: options.chatId,
        trigger: options.trigger
      }
      if (options.messageId) {
        jsonBody.messageId = options.messageId
      }
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && key !== 'files') {
          jsonBody[key] = value
        }
      }
      headers['Content-Type'] = 'application/json'

      response = await this.fetchImpl(api, {
        method: 'POST',
        body: JSON.stringify(jsonBody),
        signal: this._abortController.signal,
        headers
      })
    }

    if (!response.ok || !response.body) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }

    return this.processResponseStream(response.body)
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }

  private processResponseStream(
    stream: ReadableStream<Uint8Array>
  ): ReadableStream<UIMessageChunk> {
    return parseJsonEventStream({ stream, schema: z.any() }).pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (!chunk.success) {
            throw chunk.error
          }
          controller.enqueue(chunk.value as UIMessageChunk)
        }
      })
    )
  }
}

function getBodyRecord(body: unknown): Record<string, unknown> {
  return isPlainObject(body) ? body : {}
}

function getBodyFiles(body: Record<string, unknown>): File[] {
  const files = body.files
  if (files === undefined) return []
  if (Array.isArray(files) && files.every((file) => file instanceof File)) return files
  throw new Error('Multipart files must be an array of File objects')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
