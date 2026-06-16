import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../src/lib/db'
import {
  appendConversationChunks,
  createConversation,
  deleteChunksByRefId,
  getConversationChunksWithTypes,
  setConversationChunksWithTypes
} from '../src/storage/repository'
import { addFileToConversation } from '../src/storage/document/file-manager'
import { getApiTestState, registerApiTestLifecycle } from './helpers/api-test-helper'

registerApiTestLifecycle()

async function createTestRef(conversationId: string, name: string): Promise<number> {
  const result = await addFileToConversation(
    conversationId,
    Buffer.from(`${name}-${Date.now()}-${Math.random()}`),
    name,
    'txt',
    'reference'
  )
  return result.refId
}

describe('Chunk Classification', () => {
  it('should classify resume chunks with role and category', async () => {
    const convId = `conv_chunk_resume_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await setConversationChunksWithTypes(convId, [
      {
        pageContent: 'Resume chunk 1 content',
        metadata: { source: 'resume.pdf' },
        role: 'original',
        category: 'resume'
      },
      {
        pageContent: 'Resume chunk 2 content',
        metadata: { source: 'resume.pdf' },
        role: 'original',
        category: 'resume'
      }
    ])

    const typedChunks = await getConversationChunksWithTypes(convId)
    expect(typedChunks).toHaveLength(2)
    expect(typedChunks[0].role).toBe('original')
    expect(typedChunks[0].category).toBe('resume')
    expect(typedChunks[1].role).toBe('original')
    expect(typedChunks[1].category).toBe('resume')
  })

  it('should classify supporting chunks with role and category', async () => {
    const convId = `conv_chunk_ref_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await setConversationChunksWithTypes(convId, [
      {
        pageContent: 'Reference chunk 1',
        metadata: { source: 'job_desc.pdf' },
        role: 'reference',
        category: 'job'
      },
      {
        pageContent: 'Reference chunk 2',
        metadata: { source: 'job_desc.pdf' },
        role: 'reference',
        category: 'job'
      }
    ])

    const typedChunks = await getConversationChunksWithTypes(convId)
    expect(typedChunks).toHaveLength(2)
    expect(typedChunks[0].role).toBe('reference')
    expect(typedChunks[0].category).toBe('job')
    expect(typedChunks[1].role).toBe('reference')
    expect(typedChunks[1].category).toBe('job')
  })

  it('should handle mixed primary resume and supporting material chunks', async () => {
    const convId = `conv_chunk_mixed_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await setConversationChunksWithTypes(convId, [
      {
        pageContent: 'Resume content',
        metadata: { source: 'my_resume.pdf' },
        role: 'original',
        category: 'resume'
      },
      {
        pageContent: 'Reference content',
        metadata: { source: 'reference.pdf' },
        role: 'reference',
        category: 'resume'
      }
    ])

    const typedChunks = await getConversationChunksWithTypes(convId)
    expect(typedChunks).toHaveLength(2)
    expect(typedChunks[0].role).toBe('original')
    expect(typedChunks[0].category).toBe('resume')
    expect(typedChunks[1].role).toBe('reference')
    expect(typedChunks[1].category).toBe('resume')
  })

  it('should default to original resume for chunks without role/category', async () => {
    const convId = `conv_chunk_orphan_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await db.insert(schema.chunks).values({
      conversationId: convId,
      pageContent: 'Orphan chunk content',
      metadata: { source: 'unknown.pdf' },
      source: 'unknown.pdf',
      chunkIndex: 0,
      createdAt: Date.now()
    })

    const typedChunks = await getConversationChunksWithTypes(convId)
    expect(typedChunks).toHaveLength(1)
    expect(typedChunks[0].role).toBe('original')
    expect(typedChunks[0].category).toBe('resume')
  })

  it('should sanitize database-unsafe control characters before inserting chunks', async () => {
    const convId = `conv_chunk_sanitize_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    await setConversationChunksWithTypes(convId, [
      {
        pageContent: 'A\u0000B\u0001C\t\nD',
        metadata: {
          source: 'bad\u0000source.pdf',
          nested: { note: 'x\u0000y\u0002z' }
        },
        role: 'reference',
        category: 'job'
      }
    ])

    const typedChunks = await getConversationChunksWithTypes(convId)
    expect(typedChunks[0].pageContent).toBe('ABC\t\nD')
    expect(typedChunks[0].metadata.source).toBe('badsource.pdf')
    expect((typedChunks[0].metadata.nested as { note: string }).note).toBe('xyz')

    const [row] = await db
      .select({ source: schema.chunks.source })
      .from(schema.chunks)
      .where(eq(schema.chunks.conversationId, convId))
      .limit(1)
    expect(row?.source).toBe('badsource.pdf')
  })

  it('should return empty array for conversation with no chunks', async () => {
    const convId = `conv_chunk_empty_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)

    const typedChunks = await getConversationChunksWithTypes(convId)
    expect(typedChunks).toHaveLength(0)
  })

  it('should exclude removed ref chunks from results', async () => {
    const convId = `conv_chunk_removed_ref_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    const refId = await createTestRef(convId, 'deleted-ref.txt')

    await setConversationChunksWithTypes(
      convId,
      [
        {
          pageContent: 'Resume content',
          metadata: { source: 'resume.pdf' },
          role: 'original',
          category: 'resume'
        },
        {
          pageContent: 'Reference content',
          metadata: { source: 'ref.pdf' },
          role: 'reference',
          category: 'job'
        }
      ],
      refId
    )

    await deleteChunksByRefId(convId, refId)

    const typedChunks = await getConversationChunksWithTypes(convId)
    expect(typedChunks).toHaveLength(0)
  })

  it('should delete chunks by ref_id precisely', async () => {
    const convId = `conv_chunk_refid_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    const resumeRefId = await createTestRef(convId, 'resume-ref.txt')
    const jobARefId = await createTestRef(convId, 'job-a-ref.txt')
    const jobBRefId = await createTestRef(convId, 'job-b-ref.txt')

    await setConversationChunksWithTypes(
      convId,
      [
        {
          pageContent: 'Resume content',
          metadata: { source: 'resume.pdf' },
          role: 'original',
          category: 'resume'
        }
      ],
      resumeRefId
    )

    await appendConversationChunks(
      convId,
      [
        {
          pageContent: 'Job A reference',
          metadata: { source: 'job_a.pdf' },
          role: 'reference',
          category: 'job'
        }
      ],
      jobARefId
    )

    await appendConversationChunks(
      convId,
      [
        {
          pageContent: 'Job B reference',
          metadata: { source: 'job_b.pdf' },
          role: 'reference',
          category: 'job'
        }
      ],
      jobBRefId
    )

    const beforeDelete = await getConversationChunksWithTypes(convId)
    expect(beforeDelete).toHaveLength(3)

    await deleteChunksByRefId(convId, jobARefId)

    const afterDelete = await getConversationChunksWithTypes(convId)
    expect(afterDelete).toHaveLength(2)
    expect(afterDelete[0].pageContent).toBe('Resume content')
    expect(afterDelete[1].pageContent).toBe('Job B reference')

    const deletedRows = await db
      .select({ id: schema.chunks.id })
      .from(schema.chunks)
      .where(and(eq(schema.chunks.conversationId, convId), eq(schema.chunks.refId, jobARefId)))
    expect(deletedRows).toHaveLength(0)
  })

  it('should store ref_id on chunks for precise file tracking', async () => {
    const convId = `conv_chunk_refid_store_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    const refId = await createTestRef(convId, 'stored-ref.txt')

    await setConversationChunksWithTypes(
      convId,
      [
        {
          pageContent: 'Resume chunk',
          metadata: { source: 'resume.pdf' },
          role: 'original',
          category: 'resume'
        }
      ],
      refId
    )

    const [row] = await db
      .select({ refId: schema.chunks.refId })
      .from(schema.chunks)
      .where(
        and(eq(schema.chunks.conversationId, convId), eq(schema.chunks.pageContent, 'Resume chunk'))
      )
      .limit(1)

    expect(row?.refId).toBe(refId)
  })

  it('should cascade delete chunks when document ref is deleted', async () => {
    const convId = `conv_chunk_fk_cascade_${Date.now()}`
    await createConversation(convId, getApiTestState().testUserId)
    const refId = await createTestRef(convId, 'cascade-ref.txt')

    await setConversationChunksWithTypes(
      convId,
      [
        {
          pageContent: 'Cascade chunk',
          metadata: { source: 'cascade-ref.txt' },
          role: 'reference',
          category: 'job'
        }
      ],
      refId
    )

    await db
      .delete(schema.conversationDocumentRefs)
      .where(eq(schema.conversationDocumentRefs.id, refId))

    const remainingRows = await db
      .select({ id: schema.chunks.id })
      .from(schema.chunks)
      .where(and(eq(schema.chunks.conversationId, convId), eq(schema.chunks.refId, refId)))
    expect(remainingRows).toHaveLength(0)
  })
})
