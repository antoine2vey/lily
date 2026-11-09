import type * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopyMembers,
  canopyPlantMutes,
  careDelegations,
  delegationPlants,
  plants,
  userStatusEnum,
  users,
} from '@lily/db/schema'
import {
  and,
  eq,
  inArray,
  isNotNull,
  notExists,
  type SQL,
  sql,
} from 'drizzle-orm'
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core'
import { Array, Filter, Option } from 'effect'

type Db = PgDrizzle.PgDrizzle['Service']

type UserStatus = (typeof userStatusEnum.enumValues)[number]

export type Lock = 'suspended' | 'banned' | 'pending-deletion'

const STATUS_LOCK: Record<UserStatus, Option.Option<Lock>> = {
  active: Option.none(),
  suspended: Option.some('suspended'),
  banned: Option.some('banned'),
  pending_deletion: Option.some('pending-deletion'),
}

const reachableStatuses = Array.filter(userStatusEnum.enumValues, (status) =>
  Option.isNone(STATUS_LOCK[status])
)

export const lockOf = (user: {
  readonly status: UserStatus
}): Option.Option<Lock> => STATUS_LOCK[user.status]

export const reachableSql = (status: AnyPgColumn = users.status): SQL =>
  inArray(status, reachableStatuses)

export type AudienceRole = 'caretaker' | 'owner' | 'member'

// Drizzle names a subquery's aliased columns without the subquery's alias, so
// these names must not collide with any table joined next to the relation.
const audienceRow = (
  plantId: AnyPgColumn,
  recipientId: AnyPgColumn,
  role: AudienceRole,
  joinedAt: SQL | AnyPgColumn
) => ({
  plantId: sql<string>`${plantId}`.as('audience_plant_id'),
  recipientId: sql<string>`${recipientId}`.as('audience_recipient_id'),
  role: sql<AudienceRole>`${sql.raw(`'${role}'`)}`.as('audience_role'),
  joinedAt: sql<Date | null>`${joinedAt}`.as('audience_joined_at'),
})

const noJoinTime = sql`null::timestamptz`

const activeCaretaker = and(
  eq(careDelegations.id, delegationPlants.delegationId),
  eq(careDelegations.status, 'active')
)

export const plantAudience = (db: Db, plantScope: SQL) => {
  const caretaker = alias(users, 'caretaker')
  const noReachableCaretaker = notExists(
    db
      .select({ one: sql`1` })
      .from(delegationPlants)
      .innerJoin(careDelegations, activeCaretaker)
      .innerJoin(caretaker, eq(caretaker.id, careDelegations.caretakerId))
      .where(
        and(
          eq(delegationPlants.plantId, plants.id),
          reachableSql(caretaker.status)
        )
      )
  )
  const caretakers = db
    .select(
      audienceRow(
        plants.id,
        careDelegations.caretakerId,
        'caretaker',
        noJoinTime
      )
    )
    .from(plants)
    .innerJoin(delegationPlants, eq(delegationPlants.plantId, plants.id))
    .innerJoin(careDelegations, activeCaretaker)
    .innerJoin(users, eq(users.id, careDelegations.caretakerId))
    .where(and(plantScope, isNotNull(plants.userId), reachableSql()))
  const owners = db
    .select(audienceRow(plants.id, plants.userId, 'owner', noJoinTime))
    .from(plants)
    .innerJoin(users, eq(users.id, plants.userId))
    .where(and(plantScope, reachableSql(), noReachableCaretaker))
  const members = db
    .select(
      audienceRow(
        plants.id,
        canopyMembers.userId,
        'member',
        canopyMembers.joinedAt
      )
    )
    .from(plants)
    .innerJoin(canopyMembers, eq(canopyMembers.canopyId, plants.canopyId))
    .innerJoin(users, eq(users.id, canopyMembers.userId))
    .where(
      and(
        plantScope,
        reachableSql(),
        notExists(
          db
            .select({ one: sql`1` })
            .from(canopyPlantMutes)
            .where(
              and(
                eq(canopyPlantMutes.userId, canopyMembers.userId),
                eq(canopyPlantMutes.plantId, plants.id)
              )
            )
        )
      )
    )
  return caretakers.unionAll(owners).unionAll(members).as('plant_audience')
}

export const audienceByPlant = (
  plantIds: ReadonlyArray<string>,
  rows: ReadonlyArray<{
    readonly plantId: string
    readonly recipientId: string
  }>
): ReadonlyMap<string, ReadonlyArray<string>> =>
  new Map(
    Array.map(plantIds, (plantId) => [
      plantId,
      Array.filterMap(
        rows,
        Filter.fromPredicateOption((row) =>
          row.plantId === plantId ? Option.some(row.recipientId) : Option.none()
        )
      ),
    ])
  )
