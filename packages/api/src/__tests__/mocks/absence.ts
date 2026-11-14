import { createStubCare } from '@lily/api/__tests__/mocks/care'
import {
  createMockDelegationRepository,
  type MockDelegationRepositoryData,
} from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type { createOutboxTimeline } from '@lily/api/__tests__/mocks/outbox-timeline'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import type { AbsenceEvent } from '@lily/api/contexts/absence'
import { AbsenceLive } from '@lily/api/contexts/absence/absence'
import type {
  OpenFacts,
  Party,
} from '@lily/api/contexts/absence/domain/delegation'
import type { StoredVacation } from '@lily/api/contexts/absence/domain/vacation'
import {
  AbsenceStore,
  type AbsenceWrite,
  DELEGATION_IN,
  DUE_AT,
  heldVacationOf,
  movedOnce,
  OPEN_STATUSES,
  setOnce,
  stampOf,
  statusOf,
  storedVacationOf,
  VACATION_DUE_AT,
  vacationColumnsOf,
  vacationLeftOn,
} from '@lily/api/contexts/absence/store'
import { Care, DueMove } from '@lily/api/contexts/care'
import { Outbox } from '@lily/api/kernel/outbox'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import {
  type OwnerColumns,
  ownerOf,
} from '@lily/api/repositories/helpers/plant-owner'
import {
  exceptReminders,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { CARE_TYPES, type User, type VacationFields } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import {
  Array,
  DateTime,
  Effect,
  identity,
  Layer,
  Match,
  Option,
  Order,
  pipe,
} from 'effect'

type MockAccount = Pick<User, 'id' | 'name' | 'image'> &
  Partial<Pick<User, 'language' | 'status' | 'timezone' | keyof VacationFields>>

interface MockRequestablePlant extends OwnerColumns {
  readonly id: string
  readonly diedAt: Date | null
}

export interface InMemoryAbsenceData {
  readonly delegations?: DelegationRow[] | undefined
  readonly delegationPlants?:
    | Array<{ delegationId: string; plantId: string }>
    | undefined
  readonly users?: MockAccount[] | undefined
  readonly plants?: ReadonlyArray<MockRequestablePlant>
  readonly plantDetails?: MockDelegationRepositoryData['plants']
  readonly memberships?: ReadonlyArray<{
    readonly userId: string
    readonly canopyId: string
  }>
}

export interface AbsenceSurroundings {
  readonly notifications?: Notification[] | undefined
  readonly timeline?: ReturnType<typeof createOutboxTimeline> | undefined
  readonly store?:
    | ((store: AbsenceStore['Service']) => AbsenceStore['Service'])
    | undefined
  readonly care?: Layer.Layer<Care> | undefined
  readonly outbox?: Layer.Layer<Outbox> | undefined
}

const instantOf = (at: Option.Option<DateTime.Utc>) =>
  Option.getOrNull(Option.map(at, DateTime.toEpochMillis))

const isStoredAs = (fields: VacationFields, expected: StoredVacation) => {
  const stored = storedVacationOf(fields)
  return (
    stored.status === expected.status &&
    instantOf(stored.start) === instantOf(expected.start) &&
    instantOf(stored.end) === instantOf(expected.end)
  )
}

const VACATION_EDGE_OF = {
  start: (fields: VacationFields) => fields.vacationStart,
  end: (fields: VacationFields) => fields.vacationEnd,
} satisfies Record<
  keyof typeof VACATION_DUE_AT,
  (fields: VacationFields) => Date | null
>

const byId = Order.mapInput(
  Order.String,
  (row: { readonly id: string }) => row.id
)

export const createInMemoryAbsence = (
  data: InMemoryAbsenceData = {},
  around: AbsenceSurroundings = {}
) => {
  const delegations: DelegationRow[] = data.delegations ?? []
  const links = data.delegationPlants ?? []
  const accounts = data.users ?? []
  const plantRows = data.plants ?? []
  const events: AbsenceEvent[] = []
  const writes: AbsenceWrite[] = []
  const notifications: Notification[] = around.notifications ?? []

  const partyOf = (userId: string): Option.Option<Party> =>
    Option.map(
      Array.findFirst(accounts, (account) => account.id === userId),
      (account) => ({
        id: account.id,
        name: Option.fromNullishOr(account.name),
        language: account.language ?? 'en',
      })
    )

  const partyOrStranger = (userId: string): Party =>
    Option.getOrElse(partyOf(userId), () => ({
      id: userId,
      name: Option.none(),
      language: 'en' as const,
    }))

  const isLiving = (plantId: string) =>
    pipe(
      Array.findFirst(plantRows, (plant) => plant.id === plantId),
      Option.match({
        onNone: () => true,
        onSome: (plant) => plant.diedAt === null,
      })
    )

  const plantIdsOf = (delegationId: string) =>
    pipe(
      links,
      Array.filter((link) => link.delegationId === delegationId),
      Array.map((link) => link.plantId),
      Array.sort(Order.String)
    )

  const vacationFieldsOf = (account: MockAccount): VacationFields => ({
    vacationStatus: account.vacationStatus ?? 'none',
    vacationStart: account.vacationStart ?? null,
    vacationEnd: account.vacationEnd ?? null,
  })

  const accountRowOf = (userId: string) =>
    Option.map(
      Array.findFirst(accounts, (account) => account.id === userId),
      (account) => ({
        id: account.id,
        status: account.status ?? ('active' as const),
        timezone: account.timezone ?? null,
        ...vacationFieldsOf(account),
      })
    )

  const delegationOf = (row: DelegationRow) =>
    DELEGATION_IN[row.status]({
      id: row.id,
      owner: partyOrStranger(row.ownerId),
      caretaker: partyOrStranger(row.caretakerId),
      start: DateTime.fromDateUnsafe(row.startDate),
      end: DateTime.fromDateUnsafe(row.endDate),
      plants: Array.map(plantIdsOf(row.id), (id) => ({
        id,
        living: isLiving(id),
      })),
    })

  const isReachable = (userId: string) =>
    Array.some(
      accounts,
      (account) =>
        account.id === userId && (account.status ?? 'active') === 'active'
    )

  const isTendedByAReachableCaretaker = (plantId: string) =>
    Array.some(
      links,
      (link) =>
        link.plantId === plantId &&
        Array.some(
          delegations,
          (row) =>
            row.id === link.delegationId &&
            row.status === 'active' &&
            isReachable(row.caretakerId)
        )
    )

  const livingPlantsNobodyReachableTends = (ownerId: string) =>
    pipe(
      plantRows,
      Array.filter(
        (plant) =>
          plant.userId === ownerId &&
          plant.diedAt === null &&
          !isTendedByAReachableCaretaker(plant.id)
      ),
      Array.sort(byId),
      Array.map((plant) => plant.id)
    )

  const applyOne = (
    care: Care['Service'],
    sent: NotificationRepository['Service']
  ) =>
    Match.type<AbsenceWrite>().pipe(
      Match.tagsExhaustive({
        OpenDelegation: (w) =>
          Effect.sync(() => {
            delegations.push({
              id: w.id,
              ownerId: w.ownerId,
              caretakerId: w.caretakerId,
              status: 'pending',
              message: Option.getOrNull(w.message),
              startDate: DateTime.toDateUtc(w.start),
              endDate: DateTime.toDateUtc(w.end),
              respondedAt: null,
              canceledAt: null,
              completedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            links.push(
              ...Array.map(w.plantIds, (plantId) => ({
                delegationId: w.id,
                plantId,
              }))
            )
          }),
        MoveDelegation: (w) =>
          Effect.suspend(() => {
            const moving = Array.filter(
              delegations,
              (row) => row.id === w.id && row.status === statusOf(w.from)
            )
            Array.forEach(moving, (row) => {
              Object.assign(row, {
                status: statusOf(w.to),
                ...stampOf(w.to, w.at),
                updatedAt: new Date(),
              })
            })
            return movedOnce(w, moving.length)
          }),
        MoveDueDaysAfterAbsence: (w) =>
          care.moveDueDays({
            reason: 'vacation',
            moves: Array.flatMap(
              livingPlantsNobodyReachableTends(w.userId),
              (plantId) =>
                Array.map(CARE_TYPES, (careType) => ({
                  plantId,
                  careType,
                  move: DueMove.AfterAbsence({
                    endedAt: w.endedAt,
                    days: w.days,
                  }),
                }))
            ),
          }),
        SetVacation: (w) =>
          Effect.suspend(() => {
            const holding = Array.filter(
              accounts,
              (account) =>
                account.id === w.userId &&
                isStoredAs(vacationFieldsOf(account), w.expected)
            )
            Array.forEach(holding, (account) => {
              accounts[accounts.indexOf(account)] = {
                ...account,
                ...vacationColumnsOf(w.next),
              }
            })
            return setOnce(w, holding.length)
          }),
        SweepMuted: (w) =>
          sent.deletePendingByUserIdAndTypes(
            w.userId,
            exceptReminders(VACATION_MUTED_TOPICS)
          ),
      })
    )

  const inMemory = Layer.effect(
    AbsenceStore,
    Effect.gen(function* () {
      const applyWith = applyOne(yield* Care, yield* NotificationRepository)
      return (around.store ?? identity)(
        AbsenceStore.of({
          lockForOpening: (request) =>
            Effect.sync(() =>
              Option.map(
                partyOf(request.by),
                (owner): OpenFacts => ({
                  owner,
                  caretaker: partyOf(request.caretakerId),
                  plants: pipe(
                    plantRows,
                    Array.filter((plant) =>
                      Array.contains(request.plantIds, plant.id)
                    ),
                    Array.sort(byId),
                    Array.map((plant) => ({
                      id: plant.id,
                      owner: ownerOf(plant),
                      living: plant.diedAt === null,
                    }))
                  ),
                  canopyOfCaller: Option.map(
                    Array.findFirst(
                      data.memberships ?? [],
                      (member) => member.userId === request.by
                    ),
                    (member) => member.canopyId
                  ),
                  overlapping: pipe(
                    delegations,
                    Array.filter(
                      (row) =>
                        Array.contains(OPEN_STATUSES, row.status) &&
                        row.startDate < DateTime.toDateUtc(request.end) &&
                        row.endDate > DateTime.toDateUtc(request.start)
                    ),
                    Array.flatMap((row) => plantIdsOf(row.id)),
                    Array.filter((plantId) =>
                      Array.contains(request.plantIds, plantId)
                    ),
                    Array.dedupe
                  ),
                })
              )
            ),
          lockDelegation: (delegationId) =>
            Effect.sync(() =>
              Option.map(
                Array.findFirst(delegations, (row) => row.id === delegationId),
                delegationOf
              )
            ),
          dueDelegations: (edge, now) =>
            Effect.sync(() =>
              pipe(
                delegations,
                Array.filter(
                  (row) =>
                    Array.contains(DUE_AT[edge].statuses, row.status) &&
                    (edge === 'start' ? row.startDate : row.endDate) <=
                      DateTime.toDateUtc(now)
                ),
                Array.sort(byId),
                Array.map((row) => row.id)
              )
            ),
          lockVacation: (userId, now) =>
            Effect.sync(() =>
              Option.flatMap(accountRowOf(userId), (account) =>
                heldVacationOf(account, now)
              )
            ),
          holdForDeletion: () => Effect.void,
          lockForRelease: (userId, now) =>
            Effect.sync(() => ({
              openDelegations: pipe(
                delegations,
                Array.filter(
                  (row) =>
                    (row.ownerId === userId || row.caretakerId === userId) &&
                    Array.contains(OPEN_STATUSES, row.status)
                ),
                Array.sort(byId),
                Array.map(delegationOf)
              ),
              vacation: Option.map(accountRowOf(userId), (account) =>
                vacationLeftOn(account, now)
              ),
            })),
          dueVacations: (edge, now) =>
            Effect.sync(() =>
              pipe(
                accounts,
                Array.filter((account) => {
                  const fields = vacationFieldsOf(account)
                  const passed = VACATION_EDGE_OF[edge](fields)
                  return (
                    fields.vacationStatus === VACATION_DUE_AT[edge].status &&
                    passed !== null &&
                    passed <= DateTime.toDateUtc(now) &&
                    isReachable(account.id)
                  )
                }),
                Array.sort(byId),
                Array.map((account) => account.id)
              )
            ),
          apply: (applied) =>
            Effect.forEach(
              applied,
              (write) =>
                Effect.suspend(() => {
                  writes.push(write)
                  return applyWith(write)
                }),
              { discard: true }
            ),
        })
      )
    })
  )

  const recording = Layer.succeed(
    Outbox,
    Outbox.of({
      append: (_to, appended) =>
        Effect.sync(() => {
          events.push(...(appended as ReadonlyArray<AbsenceEvent>))
        }),
      wake: Effect.void,
      drain: Effect.succeed(0),
      redrive: () => Effect.succeed(0),
    })
  )

  const outbox = Option.match(Option.fromNullishOr(around.outbox), {
    onNone: () => recording,
    onSome: (delivering) =>
      Layer.effect(
        Outbox,
        Effect.map(Outbox, (beneath) =>
          Outbox.of({
            ...beneath,
            append: (to, appended) =>
              Effect.andThen(
                Effect.sync(() => {
                  events.push(...(appended as ReadonlyArray<AbsenceEvent>))
                }),
                beneath.append(to, appended)
              ),
          })
        )
      ).pipe(Layer.provide(delivering)),
  })

  const sent = createMockNotificationRepository(
    notifications,
    around.timeline?.notificationOptions
  )

  const service = AbsenceLive.pipe(
    Layer.provide(
      inMemory.pipe(
        Layer.provide(
          Layer.mergeAll(around.care ?? createStubCare().layer, sent)
        )
      )
    ),
    Layer.provide(
      Layer.mergeAll(
        outbox,
        around.timeline?.sql ?? createMockSqlClient(),
        sent,
        around.timeline?.queue ?? createMockMessageQueue()
      )
    )
  )

  return {
    delegations,
    delegationPlants: links,
    events,
    writes,
    notifications,
    layer: Layer.mergeAll(
      service,
      createMockDelegationRepository({
        delegations,
        delegationPlants: links,
        users: Array.map(accounts, ({ id, name, image }) => ({
          id,
          name,
          image,
        })),
        plants: data.plantDetails,
      })
    ),
  }
}
