import { sql } from 'drizzle-orm'
import { closeDb, db } from '../src/db/client'

async function main() {
  await db.execute(sql`
    CREATE OR REPLACE VIEW "global_document_ref_counts" AS
    SELECT
      gd.id AS "global_doc_id",
      (
        COALESCE(cdr.count, 0) +
        COALESCE(ud.count, 0) +
        COALESCE(sd.count, 0)
      )::integer AS "reference_count"
    FROM "global_documents" gd
    LEFT JOIN (
      SELECT "global_doc_id", COUNT(*)::integer AS count
      FROM "conversation_document_refs"
      GROUP BY "global_doc_id"
    ) cdr ON cdr."global_doc_id" = gd.id
    LEFT JOIN (
      SELECT "global_doc_id", COUNT(*)::integer AS count
      FROM "user_documents"
      GROUP BY "global_doc_id"
    ) ud ON ud."global_doc_id" = gd.id
    LEFT JOIN (
      SELECT "global_doc_id", COUNT(*)::integer AS count
      FROM "system_documents"
      GROUP BY "global_doc_id"
    ) sd ON sd."global_doc_id" = gd.id
  `)
}

main()
  .then(async () => {
    await closeDb()
  })
  .catch(async (error) => {
    console.error(error)
    await closeDb()
    process.exit(1)
  })
