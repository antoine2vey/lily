import { userStatusEnum, users } from '@lily/db/schema'
import { inArray, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { Array, Option } from 'effect'

type UserStatus = (typeof userStatusEnum.enumValues)[number]

export type Lock = 'suspended' | 'banned' | 'pending-deletion'

// Every status gets a verdict here, so a new enum value fails to compile until
// someone decides whether that account still hears about its plants.
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
