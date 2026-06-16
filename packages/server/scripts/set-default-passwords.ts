import bcrypt from 'bcrypt'
import { or, eq, isNull } from 'drizzle-orm'
import { closeDb, db, schema } from '../src/lib/db'

async function main() {
  const users = await db
    .select({ id: schema.users.id, phone: schema.users.phone, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(or(isNull(schema.users.password), eq(schema.users.password, '')))

  console.log(`Found ${users.length} users without password`)

  for (const user of users) {
    // 默认密码 = 手机号后 6 位
    const defaultPwd = user.phone ? user.phone.slice(-6) : '123456'
    const hash = await bcrypt.hash(defaultPwd, 10)
    await db.update(schema.users).set({ password: hash }).where(eq(schema.users.id, user.id))
    console.log(`  user ${user.id}: phone=${user.phone} → password set`)
  }

  console.log('Done.')
  await closeDb()
}

main().catch((e) => {
  console.error(e)
  void closeDb()
  process.exit(1)
})
