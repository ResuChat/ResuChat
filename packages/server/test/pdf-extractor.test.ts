import { describe, expect, it } from 'vitest'
import { extractFileContent, sanitizeExtractedText } from '../src/lib/pdf/extractor'

describe('sanitizeExtractedText', () => {
  it('removes null bytes and unsafe control characters while keeping normal whitespace', () => {
    expect(sanitizeExtractedText('a\u0000b\u0001c\t\nd')).toBe('abc\t\nd')
  })
})

describe('extractFileContent', () => {
  it('rejects legacy doc files before treating them as text', async () => {
    await expect(extractFileContent(Buffer.from('abc'), 'legacy.doc')).rejects.toThrow(
      '暂不支持旧版 .doc 文件'
    )
  })
})
