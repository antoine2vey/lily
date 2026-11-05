import { users } from '@lily/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Only an active account receives pushes. Suspended, banned and
 * pending-deletion accounts keep their rows, but every query that creates or
 * addresses a notification skips them, and the dispatch gate drops any row
 * already queued for them.
 */
export const isReachableUser = () => eq(users.status, 'active')
