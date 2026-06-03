import { Request } from 'express'
import multer from 'multer'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { getChatModel } from '../../lib/providers'
import { verifyToken } from '../../auth'

export interface MulterFile {
  buffer: Buffer
  originalname: string
  mimetype: string
  size: number
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

export function decodeFilename(filename: string): string {
  try {
    return Buffer.from(filename, 'latin1').toString('utf8')
  } catch {
    return filename
  }
}

export function mergeOverlappingChunks(chunks: { pageContent: string }[]): string {
  if (chunks.length === 0) return ''
  if (chunks.length === 1) return chunks[0].pageContent

  const MAX_OVERLAP = 200
  let result = chunks[0].pageContent

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i].pageContent
    const overlapLen = Math.min(MAX_OVERLAP, result.length, next.length)
    let merged = false

    for (let len = overlapLen; len > 0; len--) {
      if (result.endsWith(next.substring(0, len))) {
        result += next.substring(len)
        merged = true
        break
      }
    }

    if (!merged) {
      result += '\n\n' + next
    }
  }

  return result
}

export async function classifyReferenceFile(content: string): Promise<string | null> {
  const refParser = StructuredOutputParser.fromNamesAndDescriptions({
    category: 'excellent_resume | reference_doc | unknown'
  })
  try {
    const response = await getChatModel().invoke([
      {
        role: 'user',
        content: `判断下面文本属于哪一类参考资料。
${refParser.getFormatInstructions()}

- excellent_resume：包含个人信息、工作经历、教育背景、技能等简历内容（典型简历）
- reference_doc：除简历外的其它参考文件，包括但不限于岗位描述(JD)、招聘准则、行业报告、公司介绍等
- unknown：无法判断

文本前300字：
${content.slice(0, 300)}`
      }
    ])
    const parsed = await refParser.parse(
      typeof response.content === 'string' ? response.content : ''
    )
    return parsed.category === 'unknown' ? null : parsed.category
  } catch (e) {
    console.error('Failed to classify reference file:', e)
    return null
  }
}

export function refCategoryLabel(category: string | null): string {
  return category === 'excellent_resume'
    ? '优秀简历'
    : category === 'reference_doc'
      ? '参考资料'
      : '参考资料'
}

export function validateURL(rawUrl: string): { valid: boolean; error?: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http/https protocols allowed' }
  }
  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]'
  ) {
    return { valid: false, error: 'Localhost URLs are not allowed' }
  }
  if (
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    return { valid: false, error: 'Private IP URLs are not allowed' }
  }
  return { valid: true }
}

export async function extractUserId(req: Request): Promise<number | null> {
  const token = (req.headers['token'] as string) || (req.headers['Token'] as string)
  if (!token) return null
  const username = await verifyToken(token)
  if (!username) return null
  const phone = username.replace(/^user_/, '')
  const { getUserIdByPhone } = await import('../../storage/repository')
  return getUserIdByPhone(phone)
}

export async function parseFileContent(file: MulterFile): Promise<string> {
  const ext = file.originalname.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') {
    const pdfParser = new PDFParse({ data: file.buffer })
    try {
      const pdfData = await pdfParser.getText()
      return pdfData.text
    } finally {
      await pdfParser.destroy()
    }
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer })
    return result.value
  } else {
    return file.buffer.toString('utf-8')
  }
}
