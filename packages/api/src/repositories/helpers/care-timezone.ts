import { canopies, plants, users } from '@lily/db/schema'
import { sql } from 'drizzle-orm'

export const careTimezoneSql = sql<string>`coalesce(
  (select ${canopies.timezone} from ${canopies} where ${canopies.id} = ${plants.canopyId}),
  (select ${users.timezone} from ${users} where ${users.id} = ${plants.userId}),
  'UTC'
)`
