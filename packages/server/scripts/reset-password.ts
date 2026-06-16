import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { closeDb, db, schema } from '../src/lib/db'

async function main() {
  const phone = '***REMOVED***'
  const newPassword = '***REMOVED***'
  const hash = await bcrypt.hash(newPassword, 10)

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.phone, phone))
    .limit(1)
  if (!user) {
    console.log('User not found')
    return
  }

  await db.update(schema.users).set({ password: hash }).where(eq(schema.users.id, user.id))
  console.log(`Password reset for ${phone}:`, newPassword)
  await closeDb()
}

main().catch((e) => {
  console.error(e)
  void closeDb()
  process.exit(1)
})
