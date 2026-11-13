import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockDelegation1 } from '@lily/api/__tests__/fixtures/delegations'
import {
  createTestPlant,
  type TestPlant,
} from '@lily/api/__tests__/fixtures/plants'
import {
  createCanopyStore,
  createMockCanopyRepository,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  Decision,
  decide,
  type GateRow,
  loadPlantFacts,
  loadRecipients,
  type PlantFacts,
  type RecipientSettings,
} from '@lily/api/services/notification-scheduler/dispatch-gate'
import {
  type CanopyId,
  CareDay,
  CareDays,
  type CareType,
  type PlantOwner,
} from '@lily/shared'
import { DateTime, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-04T12:00:00Z')
const HOUR = 3_600_000

const user = (
  overrides: Partial<RecipientSettings> = {}
): RecipientSettings => ({
  id: 'user-1',
  status: 'active',
  careReminders: true,
  tips: true,
  doNotDisturb: false,
  doNotDisturbStart: '22:00',
  doNotDisturbEnd: '07:00',
  timezone: 'UTC',
  vacationStatus: 'none',
  vacationStart: null,
  vacationEnd: null,
  ...overrides,
})

const row = (overrides: Partial<GateRow> = {}): GateRow => ({
  id: 'notification-1',
  type: 'watering_reminder',
  userId: 'user-1',
  plantId: 'plant-1',
  ...overrides,
})

const DUE_DAY = CareDay.make('2026-11-04')

const dueOn = (careType: CareType, dueDay: CareDay = DUE_DAY) => ({
  careType,
  dueDay,
})

const living = (overrides: Partial<PlantFacts> = {}): PlantFacts => ({
  diedAt: null,
  recipients: ['user-1'],
  hasOverdueCare: true,
  nearlyDue: [dueOn('watering')],
  ...overrides,
})

const plantsOf = (facts: PlantFacts = living()) => new Map([['plant-1', facts]])

const run = async (
  gateRow: GateRow,
  settings: Option.Option<RecipientSettings> = Option.some(user()),
  plants: ReadonlyMap<string, PlantFacts> = plantsOf(),
  now: Date = NOW
) => {
  const recipients = await Effect.runPromise(
    loadRecipients(Option.toArray(settings), now)
  )
  return decide(
    gateRow,
    Option.fromNullishOr(recipients.get(gateRow.userId)),
    plants,
    now
  )
}

const inDnd = user({ doNotDisturb: true })
const DND_NIGHT = new Date('2026-11-04T23:00:00Z')
const DND_END = new Date('2026-11-05T07:00:00Z')

describe('decide', () => {
  it('sends a care row for a living plant the user hears about', async () => {
    expect(await run(row())).toEqual(Decision.Send())
  })

  it('drops a row whose plant is dead or missing, whatever its category', async () => {
    const dead = plantsOf(living({ diedAt: new Date(NOW.getTime() - HOUR) }))
    expect(await run(row(), undefined, dead)).toEqual(
      Decision.Drop({ reason: 'plant-gone' })
    )
    expect(
      await run(row({ type: 'plant_anniversary' }), undefined, dead)
    ).toEqual(Decision.Drop({ reason: 'plant-gone' }))
    expect(await run(row({ type: 'nudge_to_water' }), undefined, dead)).toEqual(
      Decision.Drop({ reason: 'plant-gone' })
    )
    expect(
      await run(row({ type: 'plant_anniversary' }), undefined, new Map())
    ).toEqual(Decision.Drop({ reason: 'plant-gone' }))
    expect(
      await run(row({ type: 'nudge_to_water' }), undefined, new Map())
    ).toEqual(Decision.Drop({ reason: 'plant-gone' }))
  })

  it('sends a row with no plant without looking plants up', async () => {
    expect(
      await run(
        row({ type: 'resubscribe_nudge', plantId: undefined }),
        undefined,
        new Map()
      )
    ).toEqual(Decision.Send())
  })

  it('drops a care row for a user who no longer hears about the plant', async () => {
    const theirs = plantsOf(living({ recipients: ['user-2'] }))
    expect(await run(row(), undefined, theirs)).toEqual(
      Decision.Drop({ reason: 'not-recipient' })
    )
    expect(
      await run(row({ type: 'nudge_to_water' }), undefined, theirs)
    ).toEqual(Decision.Send())
    expect(
      await run(row({ type: 'plant_anniversary' }), undefined, theirs)
    ).toEqual(Decision.Send())
  })

  it('drops an overdue row once no care of the plant is overdue', async () => {
    const caughtUp = plantsOf(living({ hasOverdueCare: false }))
    const overdue = row({ type: 'overdue_reminder' })
    expect(await run(overdue, undefined, caughtUp)).toEqual(
      Decision.Drop({ reason: 'no-longer-overdue' })
    )
    expect(await run(overdue, undefined, plantsOf(living()))).toEqual(
      Decision.Send()
    )
    expect(await run(row(), undefined, caughtUp)).toEqual(Decision.Send())
  })

  it('drops a care reminder about a due day the care has moved on from', async () => {
    const caredToday = plantsOf(
      living({ nearlyDue: [dueOn('watering', CareDay.make('2026-11-05'))] })
    )
    expect(
      await run(row({ occasionDay: DUE_DAY }), undefined, caredToday)
    ).toEqual(Decision.Drop({ reason: 'superseded' }))
    expect(
      await run(
        row({ type: 'overdue_reminder', occasionDay: DUE_DAY }),
        undefined,
        caredToday
      )
    ).toEqual(Decision.Send())
  })

  it('sends a care reminder about the care current due day', async () => {
    expect(await run(row({ occasionDay: DUE_DAY }))).toEqual(Decision.Send())
  })

  it('sends a care reminder that records no day, whatever the due day', async () => {
    const caredToday = plantsOf(
      living({ nearlyDue: [dueOn('watering', CareDay.make('2026-11-05'))] })
    )
    expect(await run(row(), undefined, caredToday)).toEqual(Decision.Send())
  })

  it('drops a care reminder once its care is no longer due', async () => {
    const watered = plantsOf(living({ nearlyDue: [dueOn('misting')] }))
    expect(await run(row(), undefined, watered)).toEqual(
      Decision.Drop({ reason: 'no-longer-due' })
    )
    expect(
      await run(row({ type: 'misting_reminder' }), undefined, watered)
    ).toEqual(Decision.Send())
    expect(
      await run(row({ type: 'overdue_reminder' }), undefined, watered)
    ).toEqual(Decision.Send())
    expect(
      await run(row({ type: 'nudge_to_water' }), undefined, watered)
    ).toEqual(Decision.Send())
  })

  it('drops care rows when care reminders are off and engagement rows when tips are off', async () => {
    const off = Option.some(user({ careReminders: false, tips: false }))
    expect(await run(row(), off)).toEqual(
      Decision.Drop({ reason: 'care-reminders-off' })
    )
    expect(
      await run(row({ type: 'resubscribe_nudge', plantId: undefined }), off)
    ).toEqual(Decision.Drop({ reason: 'tips-off' }))
    expect(
      await run(row({ type: 'new_follower', plantId: undefined }), off)
    ).toEqual(Decision.Send())
    expect(
      await run(
        row({ type: 'resubscribe_nudge', plantId: undefined }),
        Option.some(user({ careReminders: false }))
      )
    ).toEqual(Decision.Send())
    expect(await run(row(), Option.some(user({ tips: false })))).toEqual(
      Decision.Send()
    )
  })

  it('defers care and engagement rows to the vacation end and sends social rows', async () => {
    const vacationEnd = new Date(NOW.getTime() + 48 * HOUR)
    const away = Option.some(
      user({
        vacationStatus: 'active',
        vacationStart: new Date(NOW.getTime() - 24 * HOUR),
        vacationEnd,
      })
    )
    const deferred = Decision.Defer({ reason: 'vacation', until: vacationEnd })
    expect(await run(row(), away)).toEqual(deferred)
    expect(
      await run(row({ type: 'resubscribe_nudge', plantId: undefined }), away)
    ).toEqual(deferred)
    expect(
      await run(row({ type: 'new_follower', plantId: undefined }), away)
    ).toEqual(Decision.Send())
    const booked = (vacationStart: Date) =>
      Option.some(
        user({ vacationStatus: 'scheduled', vacationStart, vacationEnd })
      )
    expect(await run(row(), booked(NOW))).toEqual(deferred)
    expect(await run(row(), booked(new Date(NOW.getTime() + HOUR)))).toEqual(
      Decision.Send()
    )
  })

  it('defers every category to the end of DND', async () => {
    const deferred = Decision.Defer({ reason: 'dnd', until: DND_END })
    const night = (gateRow: GateRow) =>
      run(gateRow, Option.some(inDnd), plantsOf(), DND_NIGHT)
    expect(await night(row())).toEqual(deferred)
    expect(
      await night(row({ type: 'resubscribe_nudge', plantId: undefined }))
    ).toEqual(deferred)
    expect(
      await night(row({ type: 'new_follower', plantId: undefined }))
    ).toEqual(deferred)
    expect(await run(row(), Option.some(inDnd), plantsOf(), NOW)).toEqual(
      Decision.Send()
    )
  })

  it.each([
    ['pending_deletion', 'pending-deletion'],
    ['suspended', 'suspended'],
    ['banned', 'banned'],
  ] as const)(
    'drops every category for a %s user, even in DND, on vacation or with care reminders and tips off',
    async (status, reason) => {
      const dropped = Decision.Drop({ reason })
      const locked = (overrides: Partial<RecipientSettings> = {}) =>
        Option.some(user({ status, ...overrides }))
      for (const gateRow of [
        row(),
        row({ type: 'overdue_reminder' }),
        row({ type: 'resubscribe_nudge', plantId: undefined }),
        row({ type: 'new_follower', plantId: undefined }),
      ]) {
        expect(await run(gateRow, locked())).toEqual(dropped)
        expect(
          await run(
            gateRow,
            locked({ doNotDisturb: true }),
            plantsOf(),
            DND_NIGHT
          )
        ).toEqual(dropped)
        expect(
          await run(gateRow, locked({ vacationStatus: 'active' }))
        ).toEqual(dropped)
        expect(
          await run(gateRow, locked({ careReminders: false, tips: false }))
        ).toEqual(dropped)
      }
    }
  )

  it('sends every category to an active user', async () => {
    for (const gateRow of [
      row(),
      row({ type: 'overdue_reminder' }),
      row({ type: 'resubscribe_nudge', plantId: undefined }),
      row({ type: 'new_follower', plantId: undefined }),
    ]) {
      expect(
        await run(gateRow, Option.some(user({ status: 'active' })))
      ).toEqual(Decision.Send())
    }
  })

  it('drops rather than defers a row the user would never get', async () => {
    const quietAndOff = Option.some(
      user({ doNotDisturb: true, careReminders: false })
    )
    expect(await run(row(), quietAndOff, plantsOf(), DND_NIGHT)).toEqual(
      Decision.Drop({ reason: 'care-reminders-off' })
    )
    expect(
      await run(
        row(),
        Option.some(inDnd),
        plantsOf(living({ diedAt: NOW })),
        DND_NIGHT
      )
    ).toEqual(Decision.Drop({ reason: 'plant-gone' }))
  })

  it('defers at least five minutes past now', async () => {
    const justBeforeEnd = new Date('2026-11-05T06:58:00Z')
    expect(
      await run(row(), Option.some(inDnd), plantsOf(), justBeforeEnd)
    ).toEqual(
      Decision.Defer({
        reason: 'dnd',
        until: new Date('2026-11-05T07:03:00Z'),
      })
    )
    const openEnded = Option.some(user({ vacationStatus: 'active' }))
    expect(await run(row(), openEnded)).toEqual(
      Decision.Defer({
        reason: 'vacation',
        until: new Date('2026-11-04T12:05:00Z'),
      })
    )
  })

  it('applies only the plant rules when the user row is missing', async () => {
    expect(await run(row(), Option.none(), plantsOf(), DND_NIGHT)).toEqual(
      Decision.Send()
    )
    expect(await run(row(), Option.none(), new Map())).toEqual(
      Decision.Drop({ reason: 'plant-gone' })
    )
  })
})

describe('loadPlantFacts', () => {
  const userOwned = (userId: string): PlantOwner => ({ _tag: 'User', userId })
  const canopyOwned: PlantOwner = {
    _tag: 'Canopy',
    canopyId: 'canopy-1' as CanopyId,
  }

  const load = (
    plants: Parameters<typeof loadPlantFacts>[0],
    {
      schedules = [],
      plants: records = [],
      delegation = createMockDelegationRepository(),
      canopy = createMockCanopyRepository([]),
    }: {
      schedules?: CareScheduleRow[]
      plants?: TestPlant[]
      delegation?: Layer.Layer<DelegationRepository>
      canopy?: Layer.Layer<CanopyRepository>
    } = {}
  ) =>
    Effect.runPromise(
      loadPlantFacts(plants).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockCareScheduleRepository({ schedules, plants: records }),
            delegation,
            canopy
          )
        )
      )
    )

  it('keeps both the active caretaker and the owner of a delegated plant', async () => {
    const facts = await load(
      [{ id: 'plant-1', diedAt: null, owner: userOwned('user-1') }],
      {
        delegation: createMockDelegationRepository({
          delegations: [{ ...mockDelegation1, status: 'active' }],
          delegationPlants: [
            { delegationId: 'delegation-1', plantId: 'plant-1' },
          ],
        }),
      }
    )
    expect(facts.get('plant-1')?.recipients).toEqual(['user-2', 'user-1'])
  })

  it('names only the owner once the delegation is over', async () => {
    const facts = await load(
      [{ id: 'plant-1', diedAt: null, owner: userOwned('user-1') }],
      {
        delegation: createMockDelegationRepository({
          delegations: [{ ...mockDelegation1, status: 'completed' }],
          delegationPlants: [
            { delegationId: 'delegation-1', plantId: 'plant-1' },
          ],
        }),
      }
    )
    expect(facts.get('plant-1')?.recipients).toEqual(['user-1'])
  })

  it('leaves out the Canopy members who muted the plant', async () => {
    const facts = await load(
      [{ id: 'plant-1', diedAt: null, owner: canopyOwned }],
      {
        canopy: createMockCanopyRepository(
          createCanopyStore({
            members: [
              createTestMembership({
                userId: 'user-1',
                canopyId: 'canopy-1' as CanopyId,
              }),
              createTestMembership({
                userId: 'user-2',
                canopyId: 'canopy-1' as CanopyId,
              }),
            ],
            mutes: [{ userId: 'user-1', plantId: 'plant-1' }],
          })
        ),
      }
    )
    expect(facts.get('plant-1')?.recipients).toEqual(['user-2'])
  })

  it('gives a dead plant no recipient and tells overdue cares from cares due within a day', async () => {
    const yesterday = new Date(Date.now() - 24 * HOUR)
    const tomorrow = new Date(Date.now() + 24 * HOUR)
    const nextWeek = new Date(Date.now() + 7 * 24 * HOUR)
    const diedAt = new Date(Date.now() - 24 * HOUR)
    const facts = await load(
      [
        { id: 'plant-1', diedAt: null, owner: userOwned('user-1') },
        { id: 'plant-2', diedAt, owner: canopyOwned },
        { id: 'plant-3', diedAt: null, owner: userOwned('user-1') },
      ],
      {
        plants: [
          createTestPlant({ id: 'plant-1', userId: 'user-1' }),
          createTestPlant({ id: 'plant-3', userId: 'user-1' }),
        ],
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: yesterday }),
          createTestSchedule({ plantId: 'plant-3', nextCareAt: tomorrow }),
          createTestSchedule({
            plantId: 'plant-3',
            careType: 'misting',
            nextCareAt: nextWeek,
          }),
        ],
      }
    )
    expect(facts.get('plant-1')?.hasOverdueCare).toBe(true)
    const dayOf = (date: Date) => CareDays.of(DateTime.makeUnsafe(date), 'UTC')
    expect(facts.get('plant-1')?.nearlyDue).toEqual([
      dueOn('watering', dayOf(yesterday)),
    ])
    expect(facts.get('plant-3')).toMatchObject({
      hasOverdueCare: false,
      nearlyDue: [dueOn('watering', dayOf(tomorrow))],
    })
    expect(facts.get('plant-2')).toEqual({
      diedAt,
      recipients: [],
      hasOverdueCare: false,
      nearlyDue: [],
    })
  })
})
