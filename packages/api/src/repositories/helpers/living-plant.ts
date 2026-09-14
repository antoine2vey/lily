import { plants } from '@lily/db/schema'
import { isNull, sql } from 'drizzle-orm'

/**
 * A plant in the cemetery (`died_at IS NOT NULL`) keeps its rows but must not
 * take part in care tasks, reminders, nudges, health updates, counts shown to
 * users, or the Live Activity. Every query that feeds those paths applies one
 * of these predicates; only the cemetery listing, admin, achievements and
 * analytics deliberately look at dead plants too.
 */
export const isLivingPlant = () => isNull(plants.diedAt)

/** Same predicate for raw `sql` template queries. */
export const livingPlantSql = sql`${plants.diedAt} IS NULL`
