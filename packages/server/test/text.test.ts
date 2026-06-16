import { describe, expect, it } from 'vitest'
import { contentCategoryLabel, decodeFilename, mergeOverlappingChunks } from '../src/lib/text'

describe('decodeFilename', () => {
  it('should decode latin1-encoded Chinese filename', () => {
    const encoded = Buffer.from('简历.pdf', 'utf8').toString('latin1')
    expect(decodeFilename(encoded)).toBe('简历.pdf')
  })

  it('should passthrough ASCII filename unchanged', () => {
    expect(decodeFilename('resume.pdf')).toBe('resume.pdf')
  })

  it('should passthrough already decoded Chinese filename unchanged', () => {
    expect(decodeFilename('简历.pdf')).toBe('简历.pdf')
  })

  it('should passthrough already decoded Chinese display name unchanged', () => {
    expect(decodeFilename('改个名字')).toBe('改个名字')
  })
})

describe('mergeOverlappingChunks', () => {
  it('should return empty string for empty array', () => {
    expect(mergeOverlappingChunks([])).toBe('')
  })

  it('should return single chunk content as-is', () => {
    expect(mergeOverlappingChunks([{ pageContent: 'hello world' }])).toBe('hello world')
  })

  it('should merge overlapping chunks', () => {
    const chunks = [{ pageContent: 'hello world foo' }, { pageContent: 'world foo bar' }]
    expect(mergeOverlappingChunks(chunks)).toBe('hello world foo bar')
  })

  it('should join non-overlapping chunks with newline', () => {
    const chunks = [{ pageContent: 'hello' }, { pageContent: 'world' }]
    expect(mergeOverlappingChunks(chunks)).toBe('hello\n\nworld')
  })
})

describe('contentCategoryLabel', () => {
  it('should return 简历 for resume', () => {
    expect(contentCategoryLabel('resume')).toBe('简历')
  })

  it('should return 岗位资料 for job', () => {
    expect(contentCategoryLabel('job')).toBe('岗位资料')
  })

  it('should return 其他资料 for null', () => {
    expect(contentCategoryLabel(null)).toBe('其他资料')
  })
})
