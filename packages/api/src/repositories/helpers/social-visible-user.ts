import { users } from '@lily/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

/**
 * Only an active account shows in a social read. Suspended, banned and
 * pending-deletion accounts keep their `user_follows` rows, so a restored
 * account shows again, but no list, count, suggestion, search or profile
 * names them.
 */
export const isSocialVisibleUser = () =>
  and(eq(users.status, 'active'), isNull(users.deletedAt))
