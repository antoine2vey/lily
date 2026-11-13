import {
  Delegation,
  type DelegationWrite,
  type OpenFacts,
  type OpenRequest,
  type Party,
  type Status,
  type Terms,
} from '@lily/api/contexts/absence/domain/delegation'
import {
  type Held,
  type StoredVacation,
  Vacation,
  type VacationWrite,
  vacationOf,
} from '@lily/api/contexts/absence/domain/vacation'
import { Care, DueMove } from '@lily/api/contexts/care'
import { lockUser } from '@lily/api/kernel/locks'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import { isReachableUser } from '@lily/api/repositories/helpers/reachable-user'
import { tending } from '@lily/api/repositories/helpers/tending'
import {
  exceptReminders,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  careDelegations,
  delegationPlants,
  plants,
  users,
} from '@lily/db/schema'
import {
  CARE_TYPES,
  type DelegationStatus,
  type LanguageCode,
  nowAsDate,
  type UserStatus,
  type VacationFields,
  type VacationStatus,
} from '@lily/shared'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  notExists,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  String,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type AbsenceWrite = DelegationWrite | VacationWrite

export type Edge = 'start' | 'end'

export interface Releasable {
  readonly openDelegations: ReadonlyArray<Delegation>
  readonly vacation: Option.Option<Held>
}

export class AbsenceStore extends Context.Service<
  AbsenceStore,
  {
    readonly lockForOpening: (
      request: OpenRequest
    ) => Effect.Effect<Option.Option<OpenFacts>, SqlError>
    readonly lockDelegation: (
      delegationId: string
    ) => Effect.Effect<Option.Option<Delegation>, SqlError>
    readonly dueDelegations: (
      edge: Edge,
      now: DateTime.Utc
    ) => Effect.Effect<ReadonlyArray<string>, SqlError>
    readonly lockVacation: (
      userId: string,
      now: DateTime.Utc
    ) => Effect.Effect<Option.Option<Held>, SqlError>
    readonly dueVacations: (
      edge: Edge,
      now: DateTime.Utc
    ) => Effect.Effect<ReadonlyArray<string>, SqlError>
    readonly holdForDeletion: (userId: string) => Effect.Effect<void, SqlError>
    readonly lockForRelease: (
      userId: string,
      now: DateTime.Utc
    ) => Effect.Effect<Releasable, SqlError>
    readonly apply: (
      writes: ReadonlyArray<AbsenceWrite>
    ) => Effect.Effect<void, SqlError>
  }
>()('absence/AbsenceStore') {}

export class DelegationNotMovedDefect extends Data.TaggedError(
  'DelegationNotMovedDefect'
)<{
  readonly delegationId: string
  readonly from: Status
  readonly to: Status
  readonly moved: number
}> {}

export const movedOnce = (
  write: Extract<DelegationWrite, { readonly _tag: 'MoveDelegation' }>,
  moved: number
): Effect.Effect<void> =>
  moved === 1
    ? Effect.void
    : Effect.die(
        new DelegationNotMovedDefect({
          delegationId: write.id,
          from: write.from,
          to: write.to,
          moved,
        })
      )

export const OPEN_STATUSES = [
  'pending',
  'accepted',
  'active',
] as const satisfies ReadonlyArray<DelegationStatus>

export const DELEGATION_IN = {
  pending: Delegation.Pending,
  accepted: Delegation.Accepted,
  active: Delegation.Active,
  rejected: Delegation.Rejected,
  canceled: Delegation.Canceled,
  completed: Delegation.Completed,
} satisfies Record<DelegationStatus, (terms: Terms) => Delegation>

export const statusOf = (status: Status): DelegationStatus =>
  String.uncapitalize(status)

type Stamp = 'respondedAt' | 'canceledAt' | 'completedAt'

export const STAMPED_ON_REACHING = {
  Pending: Option.none(),
  Accepted: Option.some('respondedAt'),
  Rejected: Option.some('respondedAt'),
  Active: Option.none(),
  Canceled: Option.some('canceledAt'),
  Completed: Option.some('completedAt'),
} satisfies Record<Status, Option.Option<Stamp>>

export const stampOf = (
  to: Status,
  at: DateTime.Utc
): Partial<Record<Stamp, Date>> =>
  Option.match(STAMPED_ON_REACHING[to], {
    onNone: () => ({}),
    onSome: (stamp) => ({ [stamp]: DateTime.toDateUtc(at) }),
  })

export const DUE_AT = {
  start: {
    statuses: ['pending', 'accepted'],
    passed: careDelegations.startDate,
  },
  end: { statuses: ['active'], passed: careDelegations.endDate },
} as const satisfies Record<
  Edge,
  {
    readonly statuses: ReadonlyArray<DelegationStatus>
    readonly passed:
      | typeof careDelegations.startDate
      | typeof careDelegations.endDate
  }
>

export class VacationNotSetDefect extends Data.TaggedError(
  'VacationNotSetDefect'
)<{
  readonly userId: string
  readonly expected: VacationStatus
  readonly next: Vacation['_tag']
  readonly set: number
}> {}

export const setOnce = (
  write: Extract<VacationWrite, { readonly _tag: 'SetVacation' }>,
  set: number
): Effect.Effect<void> =>
  set === 1
    ? Effect.void
    : Effect.die(
        new VacationNotSetDefect({
          userId: write.userId,
          expected: write.expected.status,
          next: write.next._tag,
          set,
        })
      )

const asInstant = (date: Date | null) =>
  Option.map(Option.fromNullishOr(date), DateTime.fromDateUnsafe)

export const storedVacationOf = (row: VacationFields): StoredVacation => ({
  status: row.vacationStatus,
  start: asInstant(row.vacationStart),
  end: asInstant(row.vacationEnd),
})

export const vacationColumnsOf: (vacation: Vacation) => VacationFields =
  Vacation.$match({
    None: () => ({
      vacationStatus: 'none' as const,
      vacationStart: null,
      vacationEnd: null,
    }),
    Scheduled: ({ start, end }) => ({
      vacationStatus: 'scheduled' as const,
      vacationStart: DateTime.toDateUtc(start),
      vacationEnd: DateTime.toDateUtc(end),
    }),
    Active: ({ start, end }) => ({
      vacationStatus: 'active' as const,
      vacationStart: DateTime.toDateUtc(start),
      vacationEnd: DateTime.toDateUtc(end),
    }),
  })

interface AccountRow extends VacationFields {
  readonly id: string
  readonly status: UserStatus
  readonly timezone: string | null
}

export const vacationLeftOn = (
  account: AccountRow,
  now: DateTime.Utc
): Held => ({
  userId: account.id,
  timezone: account.timezone ?? 'UTC',
  stored: storedVacationOf(account),
  vacation: vacationOf(storedVacationOf(account), now),
})

export const heldVacationOf = (
  account: AccountRow,
  now: DateTime.Utc
): Option.Option<Held> =>
  account.status === 'active'
    ? Option.some(vacationLeftOn(account, now))
    : Option.none()

export const VACATION_DUE_AT = {
  start: { status: 'scheduled', passed: users.vacationStart },
  end: { status: 'active', passed: users.vacationEnd },
} as const satisfies Record<
  Edge,
  {
    readonly status: VacationStatus
    readonly passed: typeof users.vacationStart | typeof users.vacationEnd
  }
>

const storedAt = (
  column: typeof users.vacationStart | typeof users.vacationEnd,
  instant: Option.Option<DateTime.Utc>
) =>
  Option.match(instant, {
    onNone: () => isNull(column),
    onSome: (at) => eq(column, DateTime.toDateUtc(at)),
  })

const toParty = (row: {
  readonly id: string
  readonly name: string | null
  readonly language: LanguageCode
}): Party => ({
  id: row.id,
  name: Option.fromNullishOr(row.name),
  language: row.language,
})

export const AbsenceStoreLive = Layer.effect(
  AbsenceStore,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const client = yield* SqlClient.SqlClient
    const canopies = yield* CanopyRepository
    const care = yield* Care
    const notifications = yield* NotificationRepository

    const partyColumns = {
      id: users.id,
      name: users.name,
      language: users.language,
    }

    const partiesHeldAgainstDeletion = (userIds: ReadonlyArray<string>) =>
      Effect.map(
        db
          .select(partyColumns)
          .from(users)
          .where(inArray(users.id, Array.dedupe(userIds)))
          .orderBy(asc(users.id))
          .for('key share'),
        (rows) => new Map(Array.map(rows, (row) => [row.id, toParty(row)]))
      )

    const plantsHeldAgainstDeletion = (plantIds: ReadonlyArray<string>) =>
      Array.isReadonlyArrayEmpty(plantIds)
        ? Effect.succeed([])
        : Effect.map(
            db
              .select({
                id: plants.id,
                userId: plants.userId,
                canopyId: plants.canopyId,
                diedAt: plants.diedAt,
              })
              .from(plants)
              .where(inArray(plants.id, Array.dedupe(plantIds)))
              .orderBy(asc(plants.id))
              .for('key share'),
            Array.map((row) => ({
              id: row.id,
              owner: ownerOf(row),
              living: row.diedAt === null,
            }))
          )

    const plantsWithAnOpenDelegationDuring = (request: OpenRequest) =>
      Array.isReadonlyArrayEmpty(request.plantIds)
        ? Effect.succeed([])
        : Effect.map(
            db
              .selectDistinct({ plantId: delegationPlants.plantId })
              .from(delegationPlants)
              .innerJoin(
                careDelegations,
                eq(delegationPlants.delegationId, careDelegations.id)
              )
              .where(
                and(
                  inArray(delegationPlants.plantId, [...request.plantIds]),
                  inArray(careDelegations.status, OPEN_STATUSES),
                  lt(
                    careDelegations.startDate,
                    DateTime.toDateUtc(request.end)
                  ),
                  gt(careDelegations.endDate, DateTime.toDateUtc(request.start))
                )
              ),
            Array.map((row) => row.plantId)
          )

    const lockForOpening = (request: OpenRequest) =>
      Effect.gen(function* () {
        yield* lockUser(request.by).pipe(
          Effect.provideService(SqlClient.SqlClient, client)
        )
        const parties = yield* partiesHeldAgainstDeletion([
          request.by,
          request.caretakerId,
        ])
        const requested = yield* plantsHeldAgainstDeletion(request.plantIds)
        const membership = yield* canopies.findMembershipByUser(request.by)
        const overlapping = yield* plantsWithAnOpenDelegationDuring(request)
        return Option.map(
          Option.fromNullishOr(parties.get(request.by)),
          (owner): OpenFacts => ({
            owner,
            caretaker: Option.fromNullishOr(parties.get(request.caretakerId)),
            plants: requested,
            canopyOfCaller: Option.map(
              Option.fromNullishOr(membership),
              (member) => member.canopyId
            ),
            overlapping,
          })
        )
      })

    const lockDelegation = (delegationId: string) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({
            id: careDelegations.id,
            ownerId: careDelegations.ownerId,
            caretakerId: careDelegations.caretakerId,
            status: careDelegations.status,
            startDate: careDelegations.startDate,
            endDate: careDelegations.endDate,
          })
          .from(careDelegations)
          .where(eq(careDelegations.id, delegationId))
          .for('update')
        const delegated = yield* db
          .select({ id: plants.id, diedAt: plants.diedAt })
          .from(delegationPlants)
          .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
          .where(eq(delegationPlants.delegationId, delegationId))
          .orderBy(asc(plants.id))
        const parties = yield* Option.match(Array.head(rows), {
          onNone: () => Effect.succeed([]),
          onSome: (row) =>
            db
              .select(partyColumns)
              .from(users)
              .where(inArray(users.id, [row.ownerId, row.caretakerId])),
        })
        const partyOf = (userId: string) =>
          Option.map(
            Array.findFirst(parties, (party) => party.id === userId),
            toParty
          )
        return pipe(
          Array.head(rows),
          Option.flatMap((row) =>
            Option.map(
              Option.all({
                owner: partyOf(row.ownerId),
                caretaker: partyOf(row.caretakerId),
              }),
              ({ owner, caretaker }) =>
                DELEGATION_IN[row.status]({
                  id: row.id,
                  owner,
                  caretaker,
                  start: DateTime.fromDateUnsafe(row.startDate),
                  end: DateTime.fromDateUnsafe(row.endDate),
                  plants: Array.map(delegated, (plant) => ({
                    id: plant.id,
                    living: plant.diedAt === null,
                  })),
                })
            )
          )
        )
      })

    const dueDelegations = (edge: Edge, now: DateTime.Utc) =>
      Effect.map(
        db
          .select({ id: careDelegations.id })
          .from(careDelegations)
          .where(
            and(
              inArray(careDelegations.status, DUE_AT[edge].statuses),
              lte(DUE_AT[edge].passed, DateTime.toDateUtc(now))
            )
          )
          .orderBy(asc(careDelegations.id)),
        Array.map((row) => row.id)
      )

    const accountHeld = (userId: string) =>
      Effect.map(
        db
          .select({
            id: users.id,
            status: users.status,
            timezone: users.timezone,
            vacationStatus: users.vacationStatus,
            vacationStart: users.vacationStart,
            vacationEnd: users.vacationEnd,
          })
          .from(users)
          .where(eq(users.id, userId))
          .for('no key update'),
        Array.head
      )

    const lockVacation = (userId: string, now: DateTime.Utc) =>
      Effect.map(
        accountHeld(userId),
        Option.flatMap((account) => heldVacationOf(account, now))
      )

    const partyTo = (userId: string) =>
      or(
        eq(careDelegations.ownerId, userId),
        eq(careDelegations.caretakerId, userId)
      )

    const delegationsHeldInIdOrder = (where: SQL | undefined) =>
      Effect.map(
        db
          .select({ id: careDelegations.id })
          .from(careDelegations)
          .where(where)
          .orderBy(asc(careDelegations.id))
          .for('update'),
        Array.map((row) => row.id)
      )

    const holdForDeletion = (userId: string) =>
      Effect.asVoid(
        Effect.andThen(
          delegationsHeldInIdOrder(partyTo(userId)),
          accountHeld(userId)
        )
      )

    const lockForRelease = (userId: string, now: DateTime.Utc) =>
      Effect.gen(function* () {
        const openIds = yield* delegationsHeldInIdOrder(
          and(partyTo(userId), inArray(careDelegations.status, OPEN_STATUSES))
        )
        const openDelegations = yield* Effect.forEach(openIds, lockDelegation)
        const account = yield* accountHeld(userId)
        return {
          openDelegations: Array.getSomes(openDelegations),
          vacation: Option.map(account, (row) => vacationLeftOn(row, now)),
        }
      })

    const dueVacations = (edge: Edge, now: DateTime.Utc) =>
      Effect.map(
        db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.vacationStatus, VACATION_DUE_AT[edge].status),
              lte(VACATION_DUE_AT[edge].passed, DateTime.toDateUtc(now)),
              isReachableUser()
            )
          )
          .orderBy(asc(users.id)),
        Array.map((row) => row.id)
      )

    const livingPlantsNobodyReachableTends = (ownerId: string) =>
      Effect.map(
        db
          .select({ id: plants.id })
          .from(plants)
          .where(
            and(
              eq(plants.userId, ownerId),
              isLivingPlant(),
              notExists(
                db
                  .select({ tended: sql`1` })
                  .from(delegationPlants)
                  .innerJoin(
                    careDelegations,
                    eq(delegationPlants.delegationId, careDelegations.id)
                  )
                  .where(
                    and(eq(delegationPlants.plantId, plants.id), tending())
                  )
              )
            )
          )
          .orderBy(asc(plants.id)),
        Array.map((row) => row.id)
      )

    const write: (write: AbsenceWrite) => Effect.Effect<void, SqlError> =
      Match.type<AbsenceWrite>().pipe(
        Match.tagsExhaustive({
          OpenDelegation: (w) =>
            Effect.gen(function* () {
              yield* db.insert(careDelegations).values({
                id: w.id,
                ownerId: w.ownerId,
                caretakerId: w.caretakerId,
                startDate: DateTime.toDateUtc(w.start),
                endDate: DateTime.toDateUtc(w.end),
                message: Option.getOrNull(w.message),
              })
              yield* db.insert(delegationPlants).values(
                Array.map(w.plantIds, (plantId) => ({
                  delegationId: w.id,
                  plantId,
                }))
              )
            }),
          MoveDelegation: (w) =>
            Effect.flatMap(
              db
                .update(careDelegations)
                .set({ status: statusOf(w.to), ...stampOf(w.to, w.at) })
                .where(
                  and(
                    eq(careDelegations.id, w.id),
                    eq(careDelegations.status, statusOf(w.from))
                  )
                )
                .returning({ id: careDelegations.id }),
              (moved) => movedOnce(w, moved.length)
            ),
          MoveDueDaysAfterAbsence: (w) =>
            Effect.flatMap(
              livingPlantsNobodyReachableTends(w.userId),
              (plantIds) =>
                care.moveDueDays({
                  reason: 'vacation',
                  moves: Array.flatMap(plantIds, (plantId) =>
                    Array.map(CARE_TYPES, (careType) => ({
                      plantId,
                      careType,
                      move: DueMove.AfterAbsence({
                        endedAt: w.endedAt,
                        days: w.days,
                      }),
                    }))
                  ),
                })
            ),
          SetVacation: (w) =>
            Effect.flatMap(
              db
                .update(users)
                .set({ ...vacationColumnsOf(w.next), updatedAt: nowAsDate() })
                .where(
                  and(
                    eq(users.id, w.userId),
                    eq(users.vacationStatus, w.expected.status),
                    storedAt(users.vacationStart, w.expected.start),
                    storedAt(users.vacationEnd, w.expected.end)
                  )
                )
                .returning({ id: users.id }),
              (set) => setOnce(w, set.length)
            ),
          SweepMuted: (w) =>
            notifications.deletePendingByUserIdAndTypes(
              w.userId,
              exceptReminders(VACATION_MUTED_TOPICS)
            ),
        })
      )

    return AbsenceStore.of({
      lockForOpening: (request) =>
        lockForOpening(request).pipe(
          Effect.withSpan('AbsenceStore.lockForOpening')
        ),
      lockDelegation: (delegationId) =>
        lockDelegation(delegationId).pipe(
          Effect.withSpan('AbsenceStore.lockDelegation')
        ),
      dueDelegations: (edge, now) =>
        dueDelegations(edge, now).pipe(
          Effect.withSpan('AbsenceStore.dueDelegations')
        ),
      lockVacation: (userId, now) =>
        lockVacation(userId, now).pipe(
          Effect.withSpan('AbsenceStore.lockVacation')
        ),
      dueVacations: (edge, now) =>
        dueVacations(edge, now).pipe(
          Effect.withSpan('AbsenceStore.dueVacations')
        ),
      holdForDeletion: (userId) =>
        holdForDeletion(userId).pipe(
          Effect.withSpan('AbsenceStore.holdForDeletion')
        ),
      lockForRelease: (userId, now) =>
        lockForRelease(userId, now).pipe(
          Effect.withSpan('AbsenceStore.lockForRelease')
        ),
      apply: (writes) =>
        Effect.forEach(writes, write, { discard: true }).pipe(
          Effect.withSpan('AbsenceStore.apply')
        ),
    })
  })
)
