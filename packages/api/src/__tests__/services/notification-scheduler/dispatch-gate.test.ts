import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockDelegation1 } from '@lily/api/__tests__/fixtures/delegations'
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
import type { CanopyId, PlantOwner } from '@lily/shared'
import { Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-04T12:00:00Z')
const HOUR = 3_600_000

const user = (
  overrides: Partial<RecipientSettings> = {}
): RecipientSettings => ({
  id: 'user-1',
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

const living = (overrides: Partial<PlantFacts> = {}): PlantFacts => ({
  diedAt: null,
  recipients: ['user-1'],
  nextCareAt: [new Date(NOW.getTime() - HOUR)],
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

  it('drops an overdue row once no schedule of the plant is due', async () => {
    const caughtUp = plantsOf(
      living({ nextCareAt: [new Date(NOW.getTime() + HOUR)] })
    )
    const overdue = row({ type: 'overdue_reminder' })
    expect(await run(overdue, undefined, caughtUp)).toEqual(
      Decision.Drop({ reason: 'no-longer-overdue' })
    )
    expect(
      await run(overdue, undefined, plantsOf(living({ nextCareAt: [] })))
    ).toEqual(Decision.Drop({ reason: 'no-longer-overdue' }))
    expect(
      await run(
        overdue,
        undefined,
        plantsOf(
          living({
            nextCareAt: [
              new Date(NOW.getTime() + HOUR),
              new Date(NOW.getTime() - HOUR),
            ],
          })
        )
      )
    ).toEqual(Decision.Send())
    expect(await run(row(), undefined, caughtUp)).toEqual(Decision.Send())
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
      delegation = createMockDelegationRepository(),
      canopy = createMockCanopyRepository([]),
    }: {
      schedules?: CareScheduleRow[]
      delegation?: Layer.Layer<DelegationRepository>
      canopy?: Layer.Layer<CanopyRepository>
    } = {}
  ) =>
    Effect.runPromise(
      loadPlantFacts(plants).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockCareScheduleRepository({ schedules }),
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

  it('gives a dead plant no recipient and keeps each plant to its own due dates', async () => {
    const due = new Date(NOW.getTime() - HOUR)
    const diedAt = new Date(NOW.getTime() - 24 * HOUR)
    const facts = await load(
      [
        { id: 'plant-1', diedAt: null, owner: userOwned('user-1') },
        { id: 'plant-2', diedAt, owner: canopyOwned },
      ],
      {
        schedules: [
          createTestSchedule({ plantId: 'plant-1', nextCareAt: due }),
          createTestSchedule({
            plantId: 'plant-1',
            careType: 'fertilization',
            nextCareAt: null,
          }),
          createTestSchedule({ plantId: 'plant-3', nextCareAt: due }),
        ],
      }
    )
    expect(facts.get('plant-1')?.nextCareAt).toEqual([due])
    expect(facts.get('plant-2')).toEqual({
      diedAt,
      recipients: [],
      nextCareAt: [],
    })
  })
})
