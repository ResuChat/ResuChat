import { PDFParse } from 'pdf-parse'
import { ValidationError } from '../errors'
import { sanitizeDatabaseText } from '../text'

export function sanitizeExtractedText(text: string): string {
  return sanitizeDatabaseText(text)
}

/**
 * 从 PDF Buffer 提取纯文本。
 * 统一处理 PDFParse 生命周期（create → getText → destroy）。
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const data = await parser.getText()
    return sanitizeExtractedText(data.text)
  } finally {
    await parser.destroy()
  }
}

/**
 * 从文件 Buffer 提取文本，自动检测类型（PDF / DOCX / TXT）。
 */
export async function extractFileContent(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  if (ext === 'pdf') {
    return extractPdfText(buffer)
  } else if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return sanitizeExtractedText(result.value)
  } else if (ext === 'doc') {
    throw new ValidationError(
      '暂不支持旧版 .doc 文件，请转换为 .docx、PDF、TXT 或 Markdown 后再上传'
    )
  } else {
    return sanitizeExtractedText(buffer.toString('utf-8'))
  }
}
