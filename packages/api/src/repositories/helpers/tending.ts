import { isReachableUser } from '@lily/api/repositories/helpers/reachable-user'
import { careDelegations, users } from '@lily/db/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * A delegation makes its caretaker tend its plants while it is active and
 * the caretaker's account is reachable. Plant access, the caretaking list,
 * care plan access and the reminder audience all read this one condition, so
 * a caretaker who cannot be reminded cannot act on the plant either.
 *
 * For a query that reads `care_delegations`. Inside the subquery `users` is
 * the caretaker, whatever account the outer query joined under that name.
 */
export const tending = () =>
  and(
    eq(careDelegations.status, 'active'),
    sql`exists (select 1 from ${users} where ${users.id} = ${careDelegations.caretakerId} and ${isReachableUser()})`
  )
