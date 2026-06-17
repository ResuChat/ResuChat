import { extractFileContent } from './pdf/extractor'
import { ValidationError } from './errors'
import path from 'path'
import { decodeFilename } from './text'

export interface MulterFile {
  buffer: Buffer
  originalname: string
  mimetype: string
  size: number
}

export function inferStoredFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf' || ext === 'docx' || ext === 'doc' || ext === 'md' || ext === 'txt') {
    return ext
  }
  return 'txt'
}

const SUPPORTED_UPLOAD_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md'])
const MIME_BY_EXTENSION: Record<string, Set<string>> = {
  '.pdf': new Set(['application/pdf']),
  '.docx': new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  '.txt': new Set(['text/plain']),
  '.md': new Set(['text/markdown', 'text/plain'])
}

export function assertSupportedUploadFile(filename: string, mimetype?: string): void {
  const basename = path.basename(decodeFilename(filename))
  const ext = path.extname(basename).toLowerCase()
  if (ext === '.doc') {
    throw new ValidationError(
      '暂不支持旧版 .doc 文件，请转换为 .docx、PDF、TXT 或 Markdown 后再上传'
    )
  }

  if (!SUPPORTED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new ValidationError('不支持的文件类型，请上传 PDF、DOCX、TXT 或 Markdown 文件')
  }

  const normalizedMime = mimetype?.split(';')[0]?.trim().toLowerCase()
  if (!normalizedMime) return

  if (!MIME_BY_EXTENSION[ext]?.has(normalizedMime)) {
    throw new ValidationError('上传文件扩展名与 MIME 类型不匹配')
  }
}

/** 从 MulterFile 提取文本内容（PDF/DOCX/TXT），thin wrapper */
export async function parseFileContent(file: MulterFile): Promise<string> {
  return extractFileContent(file.buffer, file.originalname)
}
