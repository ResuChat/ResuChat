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

  it('accepts supported extensions with matching or empty MIME', () => {
    expect(() => assertSupportedUploadFile('resume.pdf', 'application/pdf')).not.toThrow()
    expect(() =>
      assertSupportedUploadFile(
        'resume.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).not.toThrow()
    expect(() => assertSupportedUploadFile('notes.txt', 'text/plain')).not.toThrow()
    expect(() => assertSupportedUploadFile('notes.md', 'text/plain')).not.toThrow()
    expect(() => assertSupportedUploadFile('notes.md', 'text/markdown')).not.toThrow()
    expect(() => assertSupportedUploadFile('notes.md')).not.toThrow()
  })

  it('rejects unknown extensions and obvious MIME mismatches', () => {
    expect(() => assertSupportedUploadFile('resume.pdf', 'image/png')).toThrow(
      '上传文件扩展名与 MIME 类型不匹配'
    )
    expect(() => assertSupportedUploadFile('payload.exe')).toThrow('不支持的文件类型')
  })
})
