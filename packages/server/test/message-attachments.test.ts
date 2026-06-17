import { describe, expect, it } from 'vitest'
import { normalizeDocumentCategory, normalizeMessageAttachments } from '@resuchat/shared'

describe('normalizeMessageAttachments', () => {
  it('filters invalid attachment items', () => {
    expect(
      normalizeMessageAttachments([
        null,
        { type: 'file', source: 'upload', name: 'bad.pdf' },
        { type: 'reference', source: 'external', name: 'bad.pdf' },
        { type: 'reference', source: 'upload', name: '' }
      ])
    ).toBeUndefined()
  })

  it('normalizes reference attachment number fields', () => {
    expect(
      normalizeMessageAttachments([
        {
          type: 'reference',
          source: 'library',
          name: '简历.pdf',
          refId: '12',
          globalDocId: 34,
          docId: 0,
          fileSize: '1024',
          fileType: 'pdf',
          category: 'resume'
        }
      ])
    ).toEqual([
      {
        type: 'reference',
        source: 'library',
        name: '简历.pdf',
        refId: 12,
        globalDocId: 34,
        docId: undefined,
        fileSize: 1024,
        fileType: 'pdf',
        category: 'resume'
      }
    ])
  })
})

describe('normalizeDocumentCategory', () => {
  it('keeps known document categories and falls back to unknown', () => {
    expect(normalizeDocumentCategory('resume')).toBe('resume')
    expect(normalizeDocumentCategory('job')).toBe('job')
    expect(normalizeDocumentCategory('unknown')).toBe('unknown')
    expect(normalizeDocumentCategory('system')).toBe('unknown')
    expect(normalizeDocumentCategory(null)).toBe('unknown')
  })
})
