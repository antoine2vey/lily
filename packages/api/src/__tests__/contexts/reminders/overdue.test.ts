import {
  capAudience,
  type OverdueDigest,
  planOverdueDigest,
} from '@lily/api/contexts/reminders/domain/overdue'
import {
  type CareLine,
  Change,
  Delivery,
  type PlantState,
  planPlant,
  type Recipient,
  type ReminderRow,
} from '@lily/api/contexts/reminders/domain/plan'
import {
  CareDay,
  type CareType,
  careStatus,
  type PlantOwner,
} from '@lily/shared'
import { Array, DateTime, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const day = (value: string) => CareDay.make(value)
const at = (iso: string) => DateTime.makeUnsafe(iso)

const TODAY = day('2026-11-12')
const YESTERDAY = day('2026-11-11')
const NOW = at('2026-11-12T08:00:00Z')
const SLOT = at('2026-11-12T06:40:00Z')

const line = (careType: CareType, dueDay: CareDay): CareLine => ({
  careType,
  dueDay,
  status: careStatus(dueDay, TODAY),
})

const sam: Recipient = {
  id: 'sam',
  active: true,
  careReminders: true,
  vacation: { vacationStatus: 'none', vacationStart: null, vacationEnd: null },
  sendTimes: new Map(),
}

const plant = (
  id: string,
  overrides: Partial<PlantState> = {}
): PlantState => ({
  id,
  living: true,
  remindersEnabled: true,
  shared: false,
  lines: [line('watering', YESTERDAY)],
  audience: ['sam'],
  rows: [],
  ...overrides,
})

const digest = (overrides: Partial<OverdueDigest> = {}): OverdueDigest => ({
  recipient: sam,
  candidates: [plant('fern'), plant('ivy')],
  day: TODAY,
  alreadyReminded: false,
  slot: Option.some(SLOT),
  now: NOW,
  ...overrides,
})

const overduePut = (plantId: string) =>
  Change.Put({
    userId: 'sam',
    plantId,
    type: 'overdue_reminder',
    occasion: TODAY,
    scheduledAt: SLOT,
    over: Option.none(),
  })

const changesOf = (input: OverdueDigest): ReadonlyArray<Change> => {
  const decision = planOverdueDigest(input)
  return decision._tag === 'Planned' ? decision.changes : []
}

const skipOf = (input: OverdueDigest) => {
  const decision = planOverdueDigest(input)
  return decision._tag === 'Skipped' ? decision.why : null
}

describe('planOverdueDigest', () => {
  it('writes one row per overdue plant, about the recipient day, all at the slot', () => {
    expect(changesOf(digest())).toEqual([overduePut('fern'), overduePut('ivy')])
  })

  it('leaves out a plant that is no longer overdue', () => {
    const cared = plant('fern', { lines: [line('watering', TODAY)] })

    expect(changesOf(digest({ candidates: [cared, plant('ivy')] }))).toEqual([
      overduePut('ivy'),
    ])
  })

  it('writes one row for a plant with two overdue cares', () => {
    const both = plant('fern', {
      lines: [line('watering', YESTERDAY), line('misting', YESTERDAY)],
    })

    expect(changesOf(digest({ candidates: [both] }))).toEqual([
      overduePut('fern'),
    ])
  })

  it.each([
    ['a dead plant', { living: false, lines: [] }],
    ['a plant with reminders off', { remindersEnabled: false }],
    ['a plant that no longer addresses the recipient', { audience: ['alex'] }],
  ] as const)('leaves out %s', (_, overrides) => {
    expect(
      changesOf(
        digest({ candidates: [plant('fern', overrides), plant('ivy')] })
      )
    ).toEqual([overduePut('ivy')])
  })

  it.each([
    ['unreachable', { active: false }],
    ['care-reminders-off', { careReminders: false }],
    [
      'on-vacation',
      {
        vacation: {
          vacationStatus: 'active',
          vacationStart: new Date('2026-11-10T00:00:00Z'),
          vacationEnd: new Date('2026-11-20T00:00:00Z'),
        },
      },
    ],
  ] as const)('skips the recipient as %s', (why, overrides) => {
    expect(skipOf(digest({ recipient: { ...sam, ...overrides } }))).toBe(why)
  })

  it('skips a recipient already reminded about the day', () => {
    expect(skipOf(digest({ alreadyReminded: true }))).toBe('already-reminded')
  })

  it('skips when quiet hours leave no slot', () => {
    expect(skipOf(digest({ slot: Option.none() }))).toBe('quiet-hours')
  })

  it('skips when no candidate is overdue any more', () => {
    const cared = plant('fern', { lines: [line('watering', TODAY)] })

    expect(skipOf(digest({ candidates: [cared] }))).toBe('nothing-overdue')
    expect(skipOf(digest({ candidates: [] }))).toBe('nothing-overdue')
  })

  it('names why the plants no longer address the recipient', () => {
    const moved = plant('fern', { audience: ['alex'] })

    expect(skipOf(digest({ candidates: [moved] }))).toBe('not-in-audience')
  })

  it('writes rows the next replan keeps', () => {
    const written = Array.map(changesOf(digest()), (change, index) => {
      if (change._tag !== 'Put') throw new Error('expected a put')
      const row: ReminderRow = {
        id: `row-${index}`,
        userId: change.userId,
        type: change.type,
        delivery: Delivery.Pending({ retrying: false }),
        scheduledAt: change.scheduledAt,
        occasion: Option.some(change.occasion),
      }
      return plant(change.plantId, { rows: [row] })
    })

    expect(written).toHaveLength(2)
    expect(
      Array.flatMap(written, (state) =>
        planPlant(state, new Map([['sam', sam]]), NOW)
      )
    ).toEqual([])
  })
})

describe('capAudience', () => {
  const alexOwner: PlantOwner = { _tag: 'User', userId: 'alex' }
  const samOwner: PlantOwner = { _tag: 'User', userId: 'sam' }
  const added = (id: string, owner: PlantOwner, daysAgo: number) => ({
    id,
    owner,
    dateAdded: new Date(Date.UTC(2026, 10, 12) - daysAgo * 86_400_000),
  })
  const ids = (plants: ReadonlyArray<{ readonly id: string }>) =>
    Array.map(plants, (p) => p.id)

  it('keeps the plants an owner added first, up to the cap, and counts the rest', () => {
    const plants = [
      added('newest', alexOwner, 1),
      added('oldest', alexOwner, 30),
      added('middle', alexOwner, 10),
    ]

    const { eligible, overflow } = capAudience(plants, () => Option.some(2))

    expect(ids(eligible)).toEqual(['oldest', 'middle'])
    expect(overflow).toBe(1)
  })

  it('keeps every plant of an owner with no cap', () => {
    const plants = [added('a', alexOwner, 1), added('b', alexOwner, 2)]

    const { eligible, overflow } = capAudience(plants, () => Option.none())

    expect(ids(eligible)).toEqual(['b', 'a'])
    expect(overflow).toBe(0)
  })

  it('caps each owner on their own', () => {
    const plants = [
      added('alex-1', alexOwner, 5),
      added('alex-2', alexOwner, 4),
      added('sam-1', samOwner, 3),
      added('sam-2', samOwner, 2),
    ]

    const { eligible, overflow } = capAudience(plants, (owner) =>
      owner._tag === 'User' && owner.userId === 'alex'
        ? Option.some(1)
        : Option.none()
    )

    expect(ids(eligible)).toEqual(['alex-1', 'sam-1', 'sam-2'])
    expect(overflow).toBe(1)
  })
})
