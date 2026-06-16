import { eq, or } from 'drizzle-orm'
import { closeDb, db, schema } from '../src/lib/db'
import type { UserRole } from '../src/types/domain'

const allowedRoles = new Set<UserRole>(['normal', 'premium', 'admin'])

async function main() {
  const identifier = process.argv[2]
  const role = process.argv[3] as UserRole | undefined

  if (!identifier || !role || !allowedRoles.has(role)) {
    console.log(
      'Usage: pnpm --filter @resuchat/server exec tsx scripts/set-user-role.ts <id|email|phone> <normal|premium|admin>'
    )
    process.exitCode = 1
    return
  }

  const [user] = await db
    .select({ id: schema.users.id, phone: schema.users.phone, email: schema.users.email })
    .from(schema.users)
    .where(
      or(
        eq(schema.users.id, identifier),
        eq(schema.users.email, identifier),
        eq(schema.users.phone, identifier)
      )
    )
    .limit(1)

  if (!user) {
    console.log('User not found')
    process.exitCode = 1
    return
  }

  await db
    .update(schema.users)
    .set({ role, updatedAt: Date.now() })
    .where(eq(schema.users.id, user.id))
  console.log(
    `Role updated: id=${user.id}, email=${user.email ?? '-'}, phone=${user.phone ?? '-'}, role=${role}`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
