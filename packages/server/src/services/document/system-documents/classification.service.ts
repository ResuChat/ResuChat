import { getFastModel } from '../../../lib/ai/providers'
import {
  buildSystemDocumentClassifyPrompt,
  buildSystemDocumentMarkdownPrompt
} from '../../../lib/ai/prompts'
import { LLM_MARKDOWN_TIMEOUT } from '../../../lib/config'

type ContentCategory = 'resume' | 'job' | 'unknown'

export type { ContentCategory }

export async function classifySystemDocument(
  text: string,
  fileName: string
): Promise<ContentCategory> {
  const response = await getFastModel().invoke([
    {
      role: 'user',
      content: buildSystemDocumentClassifyPrompt(text, fileName)
    }
  ])

  const raw = stringifyModelContent(response.content).trim()
  const category = parseCategoryFromModelOutput(raw)
  if (!category) {
    throw new Error(`Invalid system document category output: ${raw.slice(0, 120)}`)
  }
  return category
}

export async function formatSystemDocumentAsMarkdown(
  text: string,
  fileName: string,
  category: ContentCategory
): Promise<string> {
  const response = await getFastModel().invoke(
    [
      {
        role: 'user',
        content: buildSystemDocumentMarkdownPrompt(text, fileName, category)
      }
    ],
    { signal: AbortSignal.timeout(LLM_MARKDOWN_TIMEOUT) }
  )

  const markdown = normalizeMarkdownOutput(stringifyModelContent(response.content))
  if (!markdown) {
    throw new Error('System document markdown formatting returned empty content')
  }
  return markdown
}

function normalizeMarkdownOutput(raw: string): string {
  let markdown = raw.trim()
  const mdMatch = markdown.match(/```(?:markdown)?\s*([\s\S]*?)```/i)
  if (mdMatch) {
    markdown = mdMatch[1].trim()
  } else {
    const headingStart = markdown.search(/^#{1,3}\s/m)
    if (headingStart > 0) markdown = markdown.slice(headingStart).trim()
  }
  return markdown
}

function stringifyModelContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && 'text' in part
          ? String((part as { text?: unknown }).text ?? '')
          : String(part)
      )
      .join('')
  }
  return String(content ?? '')
}

function parseCategoryFromModelOutput(raw: string): ContentCategory | null {
  const direct = raw.trim().toLowerCase()
  if (direct === 'resume' || direct === 'job' || direct === 'unknown') return direct

  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonText) return null
  try {
    const parsed = JSON.parse(jsonText) as { category?: unknown }
    if (
      parsed.category === 'resume' ||
      parsed.category === 'job' ||
      parsed.category === 'unknown'
    ) {
      return parsed.category
    }
  } catch {
    return null
  }
  return null
}
