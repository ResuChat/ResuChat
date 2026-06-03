import * as lancedb from '@lancedb/lancedb'
import { getEmbedding } from './providers'

const DB_PATH = './data/lancedb'

let db: lancedb.Connection | null = null

async function getDb(): Promise<lancedb.Connection> {
  if (!db) db = await lancedb.connect(DB_PATH)
  return db
}

async function embed(text: string): Promise<number[]> {
  return getEmbedding(text)
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((t) => getEmbedding(t)))
}

export async function indexSystemDocumentChunks(
  globalDocId: number,
  chunks: { pageContent: string; chunkIndex: number }[],
  docType: string,
  category: string
): Promise<void> {
  if (chunks.length === 0) return

  const texts = chunks.map((c) => c.pageContent)
  const vectors = await embedBatch(texts)

  const conn = await getDb()
  const data = chunks.map((c, i) => ({
    vector: vectors[i],
    text: c.pageContent,
    globalDocId: globalDocId,
    chunkIndex: c.chunkIndex,
    docType,
    category
  }))

  const tableNames = await conn.tableNames()
  if (!tableNames.includes('system_chunks')) {
    const table = await conn.createTable('system_chunks', data)
    await table.createIndex('vector', {
      config: lancedb.Index.ivfPq({ numPartitions: Math.max(2, Math.ceil(chunks.length / 100)) })
    })
  } else {
    const table = await conn.openTable('system_chunks')
    await table.add(data)
    await table.createIndex('vector', {
      config: lancedb.Index.ivfPq({ numPartitions: Math.max(2, Math.ceil(chunks.length / 100)) })
    })
  }

  console.log(`[vector-db] indexed ${chunks.length} system chunks (${docType}/${category})`)
}

export async function searchSystemChunks(
  query: string,
  k: number = 3,
  category?: string
): Promise<{ text: string; score: number; docType: string; category: string }[]> {
  const conn = await getDb()
  const tableNames = await conn.tableNames()
  if (!tableNames.includes('system_chunks')) return []

  const table = await conn.openTable('system_chunks')
  const queryVec = await embed(query)

  let results: any[]
  if (category) {
    results = await table.search(queryVec).where(`category = "${category}"`).limit(k).toArray()
  } else {
    results = await table.search(queryVec).limit(k).toArray()
  }

  return results.map((r: any) => ({
    text: r.text as string,
    score: 1 / (1 + (r._distance ?? 0) * (r._distance ?? 0)),
    docType: r.docType as string,
    category: r.category as string
  }))
}

export async function deleteSystemChunks(globalDocId: number): Promise<void> {
  const conn = await getDb()
  const tableNames = await conn.tableNames()
  if (!tableNames.includes('system_chunks')) return
  const table = await conn.openTable('system_chunks')
  await table.delete(`globalDocId = ${globalDocId}`)
  console.log(`[vector-db] deleted system chunks for globalDocId ${globalDocId}`)
}
