import path from 'path'
import fs from 'fs'
import pdfMake from 'pdfmake'
import { logger } from '../logger'
import {
  PDF_PAGE_WIDTH,
  PDF_PAGE_HEIGHT,
  PDF_MARGIN_TOP,
  PDF_MARGIN_RIGHT,
  PDF_MARGIN_BOTTOM,
  PDF_MARGIN_LEFT
} from '../config'
pdfMake.setLocalAccessPolicy(() => true)
pdfMake.setUrlAccessPolicy(() => false)

type PdfContent = Record<string, unknown>

const FONT_REGULAR = path.join(process.cwd(), 'fonts', 'SourceHanSansSC-Regular.otf')
const FONT_BOLD = path.join(process.cwd(), 'fonts', 'SourceHanSansSC-Bold.otf')

if (!fs.existsSync(FONT_REGULAR) || !fs.existsSync(FONT_BOLD)) {
  logger.warn('PDF font files not found, output may be corrupted', {
    regular: FONT_REGULAR,
    bold: FONT_BOLD
  })
}

pdfMake.fonts = {
  SourceHan: {
    normal: FONT_REGULAR,
    bold: FONT_BOLD,
    italics: FONT_REGULAR,
    bolditalics: FONT_BOLD
  }
}

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { toString } from 'mdast-util-to-string'
import type { Root, RootContent } from 'mdast'

const serializer = unified().use(remarkStringify)

function stringifyRootContent(node: RootContent): string {
  return serializer.stringify({ type: 'root', children: [node] } satisfies Root)
}

export interface ResumeSection {
  title: string
  content: string
  level: number
  children: ResumeSection[]
}

export function parseResumeSections(text: string): ResumeSection[] {
  const tree = unified().use(remarkParse).parse(text) as Root
  const children = tree.children
  const stack: { level: number; section: ResumeSection }[] = [
    { level: 0, section: { title: '', content: '', level: 0, children: [] } }
  ]

  for (const node of children) {
    if (node.type === 'heading') {
      const title = toString(node)
      const level = node.depth
      const section: ResumeSection = { title, content: '', level, children: [] }
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
      stack.push({ level, section })
      const parent = stack.length > 1 ? stack[stack.length - 2].section : null
      if (parent) parent.children.push(section)
    } else {
      const line = stringifyRootContent(node).trimEnd()
      if (line && stack.length > 0) {
        const cur = stack[stack.length - 1].section
        cur.content += (cur.content ? '\n' : '') + line
      }
    }
  }

  const sentinel = stack[0].section
  if (sentinel.children.length > 0) return sentinel.children
  if (sentinel.content) return [sentinel]
  return []
}

const PAGE_WIDTH = PDF_PAGE_WIDTH
const PAGE_HEIGHT = PDF_PAGE_HEIGHT
const MARGINS = {
  top: PDF_MARGIN_TOP,
  right: PDF_MARGIN_RIGHT,
  bottom: PDF_MARGIN_BOTTOM,
  left: PDF_MARGIN_LEFT
}

export function sectionsToContentArray(sections: ResumeSection[]): PdfContent[] {
  const content: PdfContent[] = []
  for (const section of sections) {
    content.push(...sectionToContent(section, section.level || 1))
  }
  return content
}

function sectionToContent(section: ResumeSection, level: number): PdfContent[] {
  const items: PdfContent[] = []
  const displayLevel = Math.max(1, level)
  const titleFontSize = displayLevel === 1 ? 15 : displayLevel === 2 ? 12 : 10
  const bold = displayLevel <= 2
  const indent = (displayLevel - 1) * 20

  const headingSegments = parseInlineForHeading(section.title, titleFontSize, bold)
  items.push({
    ...headingSegments,
    margin: [indent, 4, 0, 2]
  })

  if (displayLevel === 1) {
    items.push({
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: PAGE_WIDTH - MARGINS.left - MARGINS.right,
          y2: 0,
          lineWidth: 0.5
        }
      ],
      margin: [0, 0, 0, 4]
    })
  }

  if (section.content) {
    const contentMarginLeft = indent + 15
    for (const line of section.content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const leadingSpaces = line.length - line.trimStart().length
      const nestIndent = Math.floor(leadingSpaces / 2) * 15
      items.push(parseLineToPdfmake(trimmed, contentMarginLeft + nestIndent))
    }
  }

  for (const child of section.children) {
    items.push(...sectionToContent(child, child.level || displayLevel + 1))
  }

  return items
}

function parseLineToPdfmake(line: string, marginLeft: number): PdfContent {
  const listMatch = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/)
  if (listMatch) {
    const orderedMatch = line.match(/^(\d+)[.)]\s+(.+)$/)
    const bullet = orderedMatch ? `${orderedMatch[1]}. ` : '• '
    return {
      text: [{ text: bullet, fontSize: 10, font: 'SourceHan' }, ...parseInline(listMatch[1])],
      margin: [marginLeft, 1, 0, 1]
    }
  }

  const blockquoteMatch = line.match(/^>\s+(.+)$/)
  if (blockquoteMatch) {
    return {
      text: parseInline(blockquoteMatch[1]),
      margin: [marginLeft, 1, 0, 1],
      color: '#666',
      fontStyle: 'italic'
    }
  }

  return {
    text: parseInline(line),
    margin: [marginLeft, 1, 0, 1]
  }
}

const CSS_TO_PDFMAKE: Record<string, string> = {
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  color: 'color',
  'background-color': 'background',
  'text-align': 'alignment',
  'text-decoration': 'decoration',
  'line-height': 'lineHeight',
  margin: 'margin',
  padding: 'padding',
  opacity: 'opacity'
}

function parseStyle(styleStr: string): PdfContent {
  const result: PdfContent = {}
  for (const rule of styleStr.split(';')) {
    const [k, v] = rule.split(':').map((s) => s.trim())
    if (!k || !v) continue
    const pdfKey = CSS_TO_PDFMAKE[k]
    if (pdfKey === 'fontSize') {
      result[pdfKey] = v.endsWith('em') ? Math.round(parseFloat(v) * 10) : parseFloat(v)
    } else if (pdfKey === 'fontWeight' && v === 'bold') result.bold = true
    else if (pdfKey === 'fontStyle' && v === 'italic') result.italics = true
    else if (pdfKey === 'decoration') result[pdfKey] = v === 'underline' ? 'underline' : v
    else if (pdfKey) result[pdfKey] = v
  }
  return result
}

function parseInline(text: string): PdfContent[] {
  const segments: PdfContent[] = []
  let last = 0

  // 归一化 LLM 常见的标签格式错误
  text = text.replace(/<\/%(span)>/g, '</%span%>')
  const spanRe = /<%(span)(?:\s+style="([^"]*)")?\s*%>([\s\S]*?)<\/%\1%>/g
  let m: RegExpExecArray | null

  while ((m = spanRe.exec(text)) !== null) {
    if (m.index > last) pushBold(segments, text.slice(last, m.index))
    const style = m[2]
      ? { ...parseStyle(m[2]), font: 'SourceHan' }
      : { fontSize: 10, font: 'SourceHan', color: '#333' }
    segments.push({ text: m[3], ...style })
    last = m.index + m[0].length
  }
  if (last < text.length) pushBold(segments, text.slice(last))

  return segments.length > 0 ? segments : [{ text, fontSize: 10, font: 'SourceHan', color: '#333' }]
}

function pushBold(segments: PdfContent[], text: string) {
  let last = 0
  const re = /\*\*(.+?)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      segments.push({
        text: text.slice(last, m.index),
        fontSize: 10,
        font: 'SourceHan',
        color: '#333'
      })
    segments.push({ text: m[1], fontSize: 10, bold: true, font: 'SourceHan' })
    last = m.index + m[0].length
  }
  if (last < text.length)
    segments.push({
      text: text.slice(last),
      fontSize: 10,
      font: 'SourceHan',
      color: '#333'
    })
}

function parseInlineForHeading(text: string, fontSize: number, bold: boolean): PdfContent {
  const segments = parseInline(text)
  for (const seg of segments) {
    if (seg.fontSize === 10) delete seg.fontSize
    if (seg.color === '#333') delete seg.color
  }
  return { text: segments, fontSize, bold, font: 'SourceHan' }
}

export function parseAIContent(text: string): PdfContent[] {
  // 尝试 JSON 解析
  const trimmed = text.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
    } catch {
      logger.debug('PDF content JSON parse failed, falling back to markdown parser')
    }
  }

  // 尝试在文本中提取 JSON 数组（AI 可能在数组前后加了说明文字）
  const bracketMatch = trimmed.match(/\[[\s\S]*\]/)
  if (bracketMatch) {
    try {
      const parsed = JSON.parse(bracketMatch[0])
      if (Array.isArray(parsed)) return parsed
    } catch {
      logger.debug('PDF content JSON extraction failed, falling back to markdown parser')
    }
  }

  // 降级：使用 Markdown 解析器
  const sections = parseResumeSections(text)
  return sectionsToContentArray(sections)
}

export async function generateResumePDF(
  contentOrSections: PdfContent[] | ResumeSection[]
): Promise<Uint8Array> {
  let content: PdfContent[]

  if (
    Array.isArray(contentOrSections) &&
    contentOrSections.length > 0 &&
    'title' in contentOrSections[0]
  ) {
    // 旧格式：ResumeSection[]
    content = sectionsToContentArray(contentOrSections as ResumeSection[])
  } else {
    // 新格式：直接 content 数组
    content = contentOrSections as PdfContent[]
  }

  const docDefinition = {
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    pageMargins: [MARGINS.left, MARGINS.top, MARGINS.right, MARGINS.bottom],
    defaultStyle: {
      font: 'SourceHan',
      fontSize: 10,
      lineHeight: 1.6,
      color: '#333'
    },
    styles: {
      sectionTitle: {
        fontSize: 15,
        bold: true,
        font: 'SourceHan',
        color: '#000',
        margin: [0, 8, 0, 4]
      },
      subTitle: {
        fontSize: 12,
        bold: true,
        font: 'SourceHan',
        margin: [0, 4, 0, 2]
      },
      body: {
        fontSize: 10,
        font: 'SourceHan',
        color: '#333',
        margin: [0, 0, 0, 2]
      },
      small: { fontSize: 8, font: 'SourceHan', color: '#888' },
      sectionBody: { fontSize: 10, font: 'SourceHan', color: '#333' }
    },
    content
  }

  const pdfDoc = pdfMake.createPdf(
    docDefinition as unknown as Parameters<typeof pdfMake.createPdf>[0]
  )
  const buffer: Buffer = await pdfDoc.getBuffer()
  return new Uint8Array(buffer)
}
