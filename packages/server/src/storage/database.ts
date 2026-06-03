import path from 'path'

import fs from 'fs'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    const dbPath = path.join(dataDir, 'resume.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    const schemaPath = path.join(__dirname, 'schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)

    try { db.exec('ALTER TABLE messages ADD COLUMN client_id TEXT') } catch {}
    try { db.exec('ALTER TABLE messages ADD COLUMN status TEXT DEFAULT \'completed\'') } catch {}
    try { db.exec('ALTER TABLE messages ADD COLUMN summarized INTEGER DEFAULT 0') } catch {}

    console.log('SQLite database initialized at:', dbPath)
  }
  return db
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
    console.log('SQLite database closed')
  }
}
