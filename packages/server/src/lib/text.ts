import { MERGE_MAX_OVERLAP } from './config'

/** 将 latin1 编码的文件名转为 UTF-8 */
export function decodeFilename(filename: string): string {
  const hasCjk = /[\u3400-\u9fff\uf900-\ufaff]/u.test(filename)
  const hasLatin1LikeBytes = /[\u0080-\u00ff]/u.test(filename)
  if (hasCjk || !hasLatin1LikeBytes) return filename

  try {
    const decoded = Buffer.from(filename, 'latin1').toString('utf8')
    if (decoded.includes('\uFFFD')) return filename
    return /[\u3400-\u9fff\uf900-\ufaff]/u.test(decoded) ? decoded : filename
  } catch {
    return filename
  }
}

/** 清理 PostgreSQL text/jsonb 不接受的控制字符，保留常规空白。 */
export function sanitizeDatabaseText(text: string): string {
  return Array.from(text)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || code >= 32
    })
    .join('')
}

/** 合并有重叠的 chunks，去除重复片段 */
export function mergeOverlappingChunks(chunks: { pageContent: string }[]): string {
  if (chunks.length === 0) return ''
  if (chunks.length === 1) return chunks[0].pageContent

  const MAX_OVERLAP = MERGE_MAX_OVERLAP
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

/** 内容类型 → 中文标签 */
export function contentCategoryLabel(category: string | null): string {
  return category === 'resume' ? '简历' : category === 'job' ? '岗位资料' : '其他资料'
}
