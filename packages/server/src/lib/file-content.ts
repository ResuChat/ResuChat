import { extractFileContent } from './pdf/extractor'
import { ValidationError } from './errors'

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

export function assertSupportedUploadFile(filename: string): void {
  if (inferStoredFileType(filename) === 'doc') {
    throw new ValidationError(
      '暂不支持旧版 .doc 文件，请转换为 .docx、PDF、TXT 或 Markdown 后再上传'
    )
  }
}

/** 从 MulterFile 提取文本内容（PDF/DOCX/TXT），thin wrapper */
export async function parseFileContent(file: MulterFile): Promise<string> {
  return extractFileContent(file.buffer, file.originalname)
}
