import { Request, Response } from 'express'
import { streamText, stepCountIs } from 'ai'
import { deepseek, DEFAULT_MODEL, getChatModel } from '../../../lib/providers'
import { buildSearchPrompt, buildTitlePrompt } from '../../../lib/prompts'
import { DocumentLoader } from '../../../lib/document-loader'
import {
  getConversationTitle,
  updateConversationTitle,
  isConversationOwner,
  buildHistoryPrompt
} from '../../../storage/repository'
import { getDatabase } from '../../../storage/database'
import { extractUserId, MulterFile } from '../utils'
import { classifyIntent } from './intent'
import { buildRagContext } from './rag-context'
import { updateResumeTool, proposeModificationTool } from './tools'
import fs from 'fs'
import path from 'path'

const docsDir = path.join(process.cwd(), 'docs')
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true })
}

const systemRAG = new DocumentLoader({ chunkSize: 1000, chunkOverlap: 200 })

async function initSystemRAG(retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const files = fs.readdirSync(docsDir)
      if (files.length > 0) {
        await systemRAG.loadDocuments(docsDir)
        console.log(`System RAG initialized with ${files.length} documents`)
      } else {
        console.log('System RAG: no documents found, skipping initialization')
      }
      return
    } catch (error) {
      console.error(`System RAG init attempt ${i + 1}/${retries} failed:`, error)
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delay))
    }
  }
}

initSystemRAG()

export async function performSearch(
  reqBody: {
    query: string
    content?: string
    files?: MulterFile[]
    k?: number
    url?: string
    useSystemDocs?: boolean
    conversationId?: string
    userMsgId?: string
    assistantMsgId?: string
  },
  res: Response,
  req: Request
) {
  const { query, content, files, url, useSystemDocs = true, conversationId, userMsgId, assistantMsgId } = reqBody

  if (!query) {
    res.status(400).json({ error: 'query is required' })
    return
  }

  if (conversationId) {
    const userId = await extractUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Authentication failed' })
      return
    }
    const isOwner = await isConversationOwner(conversationId, userId)
    if (!isOwner) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
    const title = await getConversationTitle(conversationId)
    if (!title) {
      try {
        const response = await getChatModel().invoke([
          { role: 'user', content: await buildTitlePrompt(query) }
        ])
        const titleText = typeof response.content === 'string' ? response.content : ''
        await updateConversationTitle(conversationId, titleText.trim())
        console.log('Generated conversation title:', titleText.trim())
      } catch (e) {
        console.error('Failed to generate title:', e)
      }
    }
  }

  const context = await buildRagContext(
    { query, content, files, url, useSystemDocs, conversationId, systemRAG },
    res,
    req
  )
  if (!context) return
  const { resumeContent, excellentResumeContent, referenceDocContent } = context

  const history = conversationId ? await buildHistoryPrompt(conversationId) : ''
  const historySection = history ? `\n对话历史:\n${history}\n` : ''

  const resumeSection = resumeContent ? `【待修改简历】\n${resumeContent}\n\n` : ''
  const excellentResumeSection = excellentResumeContent
    ? `【优秀简历范例】\n${excellentResumeContent}\n\n`
    : ''
  const referenceDocSection = referenceDocContent
    ? `【岗位参考资料】\n${referenceDocContent}\n\n`
    : ''

  console.log('[perf] intent-classify')
  const intent = await classifyIntent(query)
  console.log('[perf] intent-classify')

  const tools: Record<string, any> =
    intent === '追问'
      ? {}
      : {
          updateResume: updateResumeTool,
          proposeModification: proposeModificationTool
        }
  console.log('[DEBUG] tools registered:', Object.keys(tools))

  console.log('[perf] build-prompt')
  const searchPrompt = await buildSearchPrompt({
    historySection,
    resumeSection,
    excellentResumeSection,
    referenceDocSection,
    query,
    intent
  })
  console.log('[perf] build-prompt')
  console.log('[DEBUG] search prompt (first 300):', searchPrompt.slice(0, 300))

  console.log('[perf] streamText')

  let dbAssistantMsgId: string | null = null

  if (conversationId) {
    try {
      const db = getDatabase()

      db.prepare(
        userMsgId
          ? 'INSERT INTO messages (conversation_id, role, content, client_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          : 'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)'
      ).run(...(userMsgId
        ? [conversationId, 'user', query, userMsgId, 'completed', Date.now()]
        : [conversationId, 'user', query, Date.now()]
      ))

      if (assistantMsgId) {
        db.prepare(
          'INSERT INTO messages (conversation_id, role, content, client_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(conversationId, 'assistant', '', assistantMsgId, 'streaming', Date.now())
        dbAssistantMsgId = assistantMsgId
      }

      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
        Date.now(),
        conversationId
      )
    } catch (e) {
      console.error('Failed to persist user message:', e)
    }
  }

  let isAborted = false
  req.on('close', () => { isAborted = true })
  res.on('close', () => {
    isAborted = true
    if (dbAssistantMsgId) {
      try {
        const db = getDatabase()
        const row = db.prepare('SELECT status FROM messages WHERE client_id = ?').get(dbAssistantMsgId) as any
        if (row && row.status === 'streaming') {
          db.prepare('UPDATE messages SET status = ? WHERE client_id = ?').run('interrupted', dbAssistantMsgId)
        }
      } catch (e) {
        console.error('Failed to mark message interrupted:', e)
      }
    }
  })

  const result = streamText({
    model: deepseek(DEFAULT_MODEL),
    tools,
    stopWhen: stepCountIs(6),
    maxRetries: 3,
    prompt: searchPrompt
  })

  result.pipeUIMessageStreamToResponse(res as any, {
    ...(assistantMsgId ? { generateMessageId: () => assistantMsgId } : {}),
    consumeSseStream: async ({ stream }) => {
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let accContent = ''
      let accReasoning = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done || isAborted) break

          const text = typeof value === 'string' ? value : decoder.decode(value, { stream: true })
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'text-delta') {
                accContent += data.delta
              } else if (data.type === 'reasoning-delta') {
                accReasoning += data.delta
              } else if (data.type === 'text-end' || data.type === 'reasoning-end') {
                if (conversationId && dbAssistantMsgId) {
                  const db = getDatabase()
                  if (isAborted) {
                    db.prepare('UPDATE messages SET content = ?, reasoning = ? WHERE client_id = ?').run(
                      accContent, accReasoning, dbAssistantMsgId
                    )
                  } else {
                    db.prepare('UPDATE messages SET content = ?, reasoning = ?, status = ? WHERE client_id = ?').run(
                      accContent, accReasoning, 'streaming', dbAssistantMsgId
                    )
                  }
                }
              }
            } catch {}
          }
        }
      } finally {
        if (conversationId && dbAssistantMsgId) {
          try {
            const db = getDatabase()
            db.prepare('UPDATE messages SET content = ?, reasoning = ?, status = ? WHERE client_id = ?').run(
              accContent, accReasoning, isAborted ? 'interrupted' : 'completed', dbAssistantMsgId
            )
          } catch (e) {
            console.error('Failed to finalize messages:', e)
          }
        }
      }
    }
  })
}
