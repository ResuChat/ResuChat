import fs from 'fs'
import path from 'path'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PDFParse } from 'pdf-parse'

export interface Document {
  pageContent: string
  metadata: Record<string, unknown>
}

export interface RAGConfig {
  chunkSize: number
  chunkOverlap: number
}

export class DocumentLoader {
  public chunks: Document[] = []
  private splitter: RecursiveCharacterTextSplitter

  constructor(config?: Partial<RAGConfig>) {
    const chunkSize = config?.chunkSize ?? 1000
    const chunkOverlap = config?.chunkOverlap ?? 200
    this.splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap })
  }

  private async parsePDF(filePath: string): Promise<{ text: string; page: number }[]> {
    const buffer = fs.readFileSync(filePath)
    const parser = new PDFParse({ data: buffer })
    const pages: { text: string; page: number }[] = []
    for (let i = 1; i <= (parser as any).numpages; i++) {
      const pageData = await (parser as any).renderPage(i)
      pages.push({ text: pageData.text || '', page: i })
    }
    await parser.destroy()
    return pages
  }

  async loadDocuments(dirPath: string, reset = true): Promise<void> {
    if (reset) this.chunks = []
    const files = fs.readdirSync(dirPath)
    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const ext = path.extname(file).toLowerCase()
      try {
        let chunkIndex = 0
        if (ext === '.pdf') {
          const pages = await this.parsePDF(filePath)
          for (const { text, page } of pages) {
            if (text) {
              const texts = await this.splitter.splitText(text)
              for (const t of texts) {
                this.chunks.push({
                  pageContent: t,
                  metadata: { source: file, index: chunkIndex++, page }
                })
              }
            }
          }
        } else if (ext === '.txt') {
          const text = fs.readFileSync(filePath, 'utf-8')
          if (text) {
            const texts = await this.splitter.splitText(text)
            for (const t of texts) {
              this.chunks.push({ pageContent: t, metadata: { source: file, index: chunkIndex++ } })
            }
          }
        }
      } catch (e) {
        console.error(`Failed to load document: ${file}`, e)
      }
    }
  }

  async loadDocumentsFromText(
    docs: { text: string; metadata?: Record<string, unknown> }[],
    reset = true
  ): Promise<void> {
    if (reset) this.chunks = []
    for (const doc of docs) {
      const texts = await this.splitter.splitText(doc.text)
      for (let i = 0; i < texts.length; i++) {
        this.chunks.push({ pageContent: texts[i], metadata: doc.metadata || { index: i } })
      }
    }
  }
}
