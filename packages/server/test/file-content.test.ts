import { describe, expect, it } from 'vitest'
import { assertSupportedUploadFile, inferStoredFileType } from '../src/lib/file-content'

describe('file content upload support', () => {
  it('keeps legacy doc as its own file type instead of treating it as docx', () => {
    expect(inferStoredFileType('resume.doc')).toBe('doc')
    expect(inferStoredFileType('resume.docx')).toBe('docx')
  })

  it('rejects legacy doc uploads before they enter async parsing', () => {
    expect(() => assertSupportedUploadFile('legacy.doc')).toThrow('暂不支持旧版 .doc 文件')
    expect(() => assertSupportedUploadFile('modern.docx')).not.toThrow()
  })
})
