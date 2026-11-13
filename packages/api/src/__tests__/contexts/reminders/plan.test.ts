import {
  barredBy,
  type CareLine,
  Change,
  Delivery,
  Life,
  onlyFor,
  type PlantState,
  planPlant,
  type Recipient,
  type ReminderRow,
  type ReminderType,
  reminderTypeOf,
} from '@lily/api/contexts/reminders/domain/plan'
import { CareDay, CareDays, type CareType, careStatus } from '@lily/shared'
import { Array, DateTime, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const day = (value: string) => CareDay.make(value)
const at = (iso: string) => DateTime.makeUnsafe(iso)

const TODAY = day('2026-11-12')
const YESTERDAY = day('2026-11-11')
const TOMORROW = day('2026-11-13')
const NOW = at('2026-11-12T08:00:00Z')

const line = (careType: CareType, dueDay: CareDay): CareLine => ({
  careType,
  dueDay,
  status: careStatus(dueDay, TODAY),
})

const recipient = (
  id: string,
  options: Partial<Omit<Recipient, 'id' | 'sendTimes'>> & {
    readonly hour?: number
    readonly sendTimes?: Recipient['sendTimes']
  } = {}
): Recipient => {
  const { hour = 9, sendTimes, ...overrides } = options
  return {
    id,
    active: true,
    careReminders: true,
    vacation: {
      vacationStatus: 'none',
      vacationStart: null,
      vacationEnd: null,
    },
    sendTimes:
      sendTimes ??
      new Map(
        Array.map([-3, -2, -1, 0, 1, 2, 3, 7], (offset) => {
          const dueDay = CareDays.addDays(TODAY, offset)
          return [
            dueDay,
            DateTime.add(CareDays.startOf(dueDay, 'UTC'), { hours: hour }),
          ] as const
        })
      ),
    ...overrides,
  }
}

const sendTime = (who: Recipient, dueDay: CareDay) =>
  pipe(Option.fromNullishOr(who.sendTimes.get(dueDay)), Option.getOrThrow)

let nextRow = 0
const row = (
  userId: string,
  options: {
    readonly type?: ReminderType
    readonly delivery?: Delivery
    readonly scheduledAt?: DateTime.Utc
    readonly occasion?: CareDay | null
  } = {}
): ReminderRow => {
  const stored = {
    id: `row-${++nextRow}`,
    userId,
    delivery: options.delivery ?? Delivery.Pending({ retrying: false }),
    scheduledAt: options.scheduledAt ?? at('2026-11-12T09:00:00Z'),
  }
  const type = options.type ?? 'watering_reminder'
  return type === 'overdue_reminder'
    ? { ...stored, type }
    : {
        ...stored,
        type,
        dueDay: Option.fromNullishOr(
          options.occasion === undefined ? TODAY : options.occasion
        ),
      }
}

type PlantOptions = Partial<Omit<PlantState, 'life'>> & {
  readonly living?: boolean
  readonly lines?: ReadonlyArray<CareLine>
}

const plant = ({
  living = true,
  lines = [line('watering', TODAY)],
  ...overrides
}: PlantOptions = {}): PlantState => ({
  id: 'plant-1',
  life: living ? Life.Living({ lines }) : Life.Dead(),
  remindersEnabled: true,
  shared: false,
  audience: ['alex'],
  rows: [],
  ...overrides,
})

const people = (...recipients: ReadonlyArray<Recipient>) =>
  new Map(Array.map(recipients, (r) => [r.id, r] as const))

const alex = recipient('alex')
const justAlex = people(alex)

const put = (
  who: Recipient,
  dueDay: CareDay,
  over: Option.Option<string> = Option.none(),
  careType: CareType = 'watering'
) =>
  Option.match(over, {
    onNone: () =>
      Change.Put({
        userId: who.id,
        plantId: 'plant-1',
        type: reminderTypeOf(careType),
        occasion: dueDay,
        scheduledAt: sendTime(who, dueDay),
      }),
    onSome: (rowId) =>
      Change.Retime({
        rowId,
        userId: who.id,
        occasion: dueDay,
        scheduledAt: sendTime(who, dueDay),
      }),
  })

const removed = (changes: ReadonlyArray<Change>) =>
  Array.flatMap(changes, (change) =>
    change._tag === 'Remove' ? [[change.rowId, change.why] as const] : []
  )

const afterApplying = (
  state: PlantState,
  changes: ReadonlyArray<Change>
): PlantState => ({
  ...state,
  rows: Array.reduce(changes, state.rows, (rows, change) =>
    Change.$match(change, {
      Remove: ({ rowId }) => Array.filter(rows, (r) => r.id !== rowId),
      Retime: ({ rowId, occasion, scheduledAt }) =>
        Array.map(rows, (r) =>
          r.id === rowId && r.type !== 'overdue_reminder'
            ? { ...r, scheduledAt, dueDay: Option.some(occasion) }
            : r
        ),
      Put: ({ userId, type, occasion, scheduledAt }) => [
        ...rows,
        row(userId, { type, scheduledAt, occasion }),
      ],
    })
  ),
})

describe('planPlant, one slot of an entitled recipient', () => {
  it('writes nothing new once a row past pending carries the due day, and removes the pending one', () => {
    for (const delivery of [
      Delivery.Queued(),
      Delivery.InFlight(),
      Delivery.Sent(),
      Delivery.Failed(),
    ]) {
      const announced = row('alex', { delivery, occasion: TOMORROW })
      const pending = row('alex', { occasion: TOMORROW })
      const changes = planPlant(
        plant({
          lines: [line('watering', TOMORROW)],
          rows: [announced, pending],
        }),
        justAlex,
        NOW
      )
      expect(changes).toEqual([
        Change.Remove({
          rowId: pending.id,
          userId: 'alex',
          why: 'already-announced',
        }),
      ])
    }
  })

  it('does not count a delivered row for another due day as an announcement', () => {
    const lastWeek = row('alex', {
      delivery: Delivery.Sent(),
      occasion: day('2026-11-05'),
    })
    expect(planPlant(plant({ rows: [lastWeek] }), justAlex, NOW)).toEqual([
      put(alex, TODAY),
    ])
  })

  it('writes one row at the send time when the due day is today and the send time is ahead', () => {
    expect(planPlant(plant(), justAlex, NOW)).toEqual([put(alex, TODAY)])
  })

  it('writes one row at the send time of a later due day', () => {
    const state = plant({ lines: [line('watering', day('2026-11-19'))] })
    expect(planPlant(state, justAlex, NOW)).toEqual([
      put(alex, day('2026-11-19')),
    ])
  })

  it('does not catch up: due today with the send time passed writes nothing', () => {
    const afterSendTime = at('2026-11-12T09:00:00Z')
    expect(planPlant(plant(), justAlex, afterSendTime)).toEqual([])
    expect(planPlant(plant(), justAlex, at('2026-11-12T15:00:00Z'))).toEqual([])
  })

  it('keeps a pending row for today whose send time has passed', () => {
    const late = row('alex', { scheduledAt: at('2026-11-12T09:00:00Z') })
    expect(
      planPlant(plant({ rows: [late] }), justAlex, at('2026-11-12T15:00:00Z'))
    ).toEqual([])
  })

  it('keeps a pending row for an overdue due day: it is late or deferred, not wrong', () => {
    const deferred = row('alex', {
      occasion: YESTERDAY,
      scheduledAt: at('2026-11-12T18:00:00Z'),
    })
    const state = plant({
      lines: [line('watering', YESTERDAY)],
      rows: [deferred],
    })
    expect(planPlant(state, justAlex, NOW)).toEqual([])
  })

  it('writes nothing for an overdue due day, even while its send time is ahead', () => {
    const farWest = recipient('alex', {
      sendTimes: new Map([[YESTERDAY, at('2026-11-12T20:00:00Z')]]),
    })
    const state = plant({ lines: [line('watering', YESTERDAY)] })
    expect(planPlant(state, people(farWest), NOW)).toEqual([])
  })

  it('removes a pending row for another occasion and writes the current one', () => {
    const old = row('alex', { occasion: YESTERDAY })
    const state = plant({ lines: [line('watering', TOMORROW)], rows: [old] })
    expect(planPlant(state, justAlex, NOW)).toEqual([
      Change.Remove({ rowId: old.id, userId: 'alex', why: 'superseded' }),
      put(alex, TOMORROW),
    ])
  })

  it('removes a pending row for another occasion when nothing replaces it', () => {
    const old = row('alex', { occasion: day('2026-11-05') })
    const state = plant({ lines: [line('watering', YESTERDAY)], rows: [old] })
    expect(removed(planPlant(state, justAlex, NOW))).toEqual([
      [old.id, 'superseded'],
    ])
  })

  it('keeps one pending row per occasion and removes the extra ones', () => {
    const first = row('alex', {
      occasion: TOMORROW,
      scheduledAt: sendTime(alex, TOMORROW),
    })
    const second = row('alex', { occasion: TOMORROW })
    const state = plant({
      lines: [line('watering', TOMORROW)],
      rows: [first, second],
    })
    expect(planPlant(state, justAlex, NOW)).toEqual([
      Change.Remove({ rowId: second.id, userId: 'alex', why: 'superseded' }),
    ])
  })

  it('removes a pending care row whose care has no schedule left', () => {
    const misting = row('alex', { type: 'misting_reminder' })
    const queued = row('alex', {
      type: 'misting_reminder',
      delivery: Delivery.Queued(),
    })
    const state = plant({
      lines: [line('watering', TOMORROW)],
      rows: [misting, queued],
    })
    expect(removed(planPlant(state, justAlex, NOW))).toEqual([
      [misting.id, 'no-schedule'],
    ])
  })

  it('plans each care type on its own', () => {
    const state = plant({
      lines: [line('watering', TODAY), line('fertilization', TOMORROW)],
      rows: [row('alex', { type: 'fertilization_reminder', occasion: TODAY })],
    })
    const changes = planPlant(state, justAlex, NOW)
    expect(Array.filter(changes, Change.$is('Put'))).toEqual([
      put(alex, TODAY),
      put(alex, TOMORROW, Option.none(), 'fertilization'),
    ])
    expect(removed(changes)).toHaveLength(1)
  })
})

describe('planPlant, a row already standing for the occasion', () => {
  const tomorrowLine = [line('watering', TOMORROW)]

  it('leaves it alone when the time is unchanged', () => {
    const mine = row('alex', {
      occasion: TOMORROW,
      scheduledAt: sendTime(alex, TOMORROW),
    })
    expect(
      planPlant(plant({ lines: tomorrowLine, rows: [mine] }), justAlex, NOW)
    ).toEqual([])
  })

  it('re-times it in place when the send time moved', () => {
    const mine = row('alex', {
      occasion: TOMORROW,
      scheduledAt: at('2026-11-13T07:00:00Z'),
    })
    expect(
      planPlant(plant({ lines: tomorrowLine, rows: [mine] }), justAlex, NOW)
    ).toEqual([put(alex, TOMORROW, Option.some(mine.id))])
  })

  it('leaves it alone while delivery is retrying it', () => {
    const retrying = row('alex', {
      occasion: TOMORROW,
      scheduledAt: at('2026-11-13T07:00:00Z'),
      delivery: Delivery.Pending({ retrying: true }),
    })
    expect(
      planPlant(plant({ lines: tomorrowLine, rows: [retrying] }), justAlex, NOW)
    ).toEqual([])
  })

  it('leaves it alone when it is already ripe', () => {
    for (const scheduledAt of [NOW, at('2026-11-12T07:00:00Z')]) {
      const ripe = row('alex', { scheduledAt })
      expect(planPlant(plant({ rows: [ripe] }), justAlex, NOW)).toEqual([])
    }
  })
})

describe('planPlant, entitlement', () => {
  const onVacation = {
    vacationStatus: 'active',
    vacationStart: new Date('2026-11-10T00:00:00Z'),
    vacationEnd: new Date('2026-11-20T00:00:00Z'),
  } as const

  const cases: ReadonlyArray<
    readonly [name: string, state: PlantOptions, who: Recipient, why: string]
  > = [
    ['a dead plant', { living: false, lines: [] }, alex, 'plant-dead'],
    [
      'reminders off on the plant',
      { remindersEnabled: false },
      alex,
      'reminders-disabled',
    ],
    [
      'someone outside the audience',
      { audience: ['lily'] },
      alex,
      'not-in-audience',
    ],
    [
      'an account that is not active',
      {},
      recipient('alex', { active: false }),
      'unreachable',
    ],
    [
      'care reminders off',
      {},
      recipient('alex', { careReminders: false }),
      'care-reminders-off',
    ],
    [
      'a recipient on vacation',
      {},
      recipient('alex', { vacation: onVacation }),
      'on-vacation',
    ],
  ]

  it.each(cases)(
    '%s: no row is written and every waiting row of the five types goes',
    (_name, state, who, why) => {
      const waiting = Array.map(
        [
          'watering_reminder',
          'fertilization_reminder',
          'misting_reminder',
          'repotting_reminder',
          'overdue_reminder',
        ] as const,
        (type) => row('alex', { type })
      )
      const queued = row('alex', { delivery: Delivery.Queued() })
      const kept = [
        row('alex', { delivery: Delivery.InFlight() }),
        row('alex', { delivery: Delivery.Sent() }),
        row('alex', { delivery: Delivery.Failed() }),
      ]
      const changes = planPlant(
        plant({ ...state, rows: [...waiting, queued, ...kept] }),
        people(who, recipient('lily')),
        NOW
      )
      expect(Array.filter(changes, (c) => c.userId === 'alex')).toEqual(
        Array.map([...waiting, queued], (r) =>
          Change.Remove({ rowId: r.id, userId: 'alex', why: why as never })
        )
      )
    }
  )

  it('names the widest cause first', () => {
    const everythingWrong = recipient('alex', {
      active: false,
      careReminders: false,
      vacation: onVacation,
    })
    const reasons = Array.map(
      [
        plant({ living: false, remindersEnabled: false, audience: [] }),
        plant({ remindersEnabled: false, audience: [] }),
        plant({ audience: [] }),
        plant(),
      ],
      (state) => barredBy(state, 'alex', people(everythingWrong), NOW)
    )
    expect(reasons).toEqual([
      Option.some('plant-dead'),
      Option.some('reminders-disabled'),
      Option.some('not-in-audience'),
      Option.some('unreachable'),
    ])
    expect(
      barredBy(
        plant(),
        'alex',
        people(
          recipient('alex', { careReminders: false, vacation: onVacation })
        ),
        NOW
      )
    ).toEqual(Option.some('care-reminders-off'))
    expect(barredBy(plant(), 'alex', justAlex, NOW)).toEqual(Option.none())
  })

  it('treats an audience member whose account is gone as unreachable', () => {
    expect(barredBy(plant(), 'alex', new Map(), NOW)).toEqual(
      Option.some('unreachable')
    )
    expect(planPlant(plant(), new Map(), NOW)).toEqual([])
  })

  it('reminds again once a scheduled vacation is over', () => {
    const back = recipient('alex', {
      vacation: {
        vacationStatus: 'scheduled',
        vacationStart: new Date('2026-11-01T00:00:00Z'),
        vacationEnd: new Date('2026-11-12T08:00:00Z'),
      },
    })
    expect(planPlant(plant(), people(back), NOW)).toEqual([put(back, TODAY)])
  })
})

describe('planPlant, overdue rows', () => {
  it('removes a pending overdue row once no care of the plant is overdue', () => {
    const overdue = row('alex', { type: 'overdue_reminder', occasion: null })
    const queued = row('alex', {
      type: 'overdue_reminder',
      occasion: null,
      delivery: Delivery.Queued(),
    })
    const state = plant({
      lines: [line('watering', TOMORROW), line('misting', TODAY)],
      rows: [overdue, queued],
    })
    expect(removed(planPlant(state, justAlex, NOW))).toEqual([
      [overdue.id, 'no-longer-overdue'],
    ])
  })

  it('keeps a pending overdue row while another care is still overdue', () => {
    const overdue = row('alex', { type: 'overdue_reminder', occasion: null })
    const state = plant({
      lines: [line('watering', TOMORROW), line('misting', YESTERDAY)],
      rows: [overdue],
    })
    expect(removed(planPlant(state, justAlex, NOW))).toEqual([])
  })

  it('never writes an overdue row', () => {
    const state = plant({ lines: [line('watering', YESTERDAY)] })
    expect(planPlant(state, justAlex, NOW)).toEqual([])
  })
})

describe('planPlant, several recipients', () => {
  const lily = recipient('lily', { hour: 18 })

  it('plans every audience member at their own send time', () => {
    const state = plant({ audience: ['alex', 'lily'] })
    expect(planPlant(state, people(alex, lily), NOW)).toEqual([
      put(alex, TODAY),
      put(lily, TODAY),
    ])
  })

  it('reminds a canopy member in another timezone on the same calendar day, at their own morning', () => {
    const auckland = recipient('lily', {
      sendTimes: new Map([
        [TODAY, at('2026-11-11T20:00:00Z')],
        [TOMORROW, at('2026-11-12T20:00:00Z')],
      ]),
    })
    const dueToday = plant({ audience: ['alex', 'lily'] })
    expect(planPlant(dueToday, people(alex, auckland), NOW)).toEqual([
      put(alex, TODAY),
    ])
    const dueTomorrow = plant({
      audience: ['alex', 'lily'],
      lines: [line('watering', TOMORROW)],
    })
    expect(planPlant(dueTomorrow, people(alex, auckland), NOW)).toEqual([
      put(alex, TOMORROW),
      put(auckland, TOMORROW),
    ])
  })

  it('removes the rows of a former recipient and keeps the rows of a current one', () => {
    const mine = row('alex', { scheduledAt: sendTime(alex, TODAY) })
    const former = row('sam')
    const formerQueued = row('sam', { delivery: Delivery.Queued() })
    const formerInFlight = row('sam', { delivery: Delivery.InFlight() })
    const state = plant({ rows: [mine, former, formerQueued, formerInFlight] })
    expect(planPlant(state, justAlex, NOW)).toEqual([
      Change.Remove({
        rowId: former.id,
        userId: 'sam',
        why: 'not-in-audience',
      }),
      Change.Remove({
        rowId: formerQueued.id,
        userId: 'sam',
        why: 'not-in-audience',
      }),
    ])
  })

  it("onlyFor keeps one user's changes and plans the plant for everyone", () => {
    const state = plant({ audience: ['alex', 'lily'], rows: [row('sam')] })
    const changes = planPlant(state, people(alex, lily), NOW)
    expect(Array.map(changes, (c) => c.userId).sort()).toEqual([
      'alex',
      'lily',
      'sam',
    ])
    expect(onlyFor(changes, Option.some('lily'))).toEqual([put(lily, TODAY)])
    expect(onlyFor(changes, Option.none())).toEqual(changes)
  })
})

describe('planPlant, a personal plant changing hands', () => {
  const ann = recipient('ann')
  const AFTER_SEND_TIME = at('2026-11-12T14:00:00Z')
  const leftBy = (delivery: Delivery = Delivery.Pending({ retrying: false })) =>
    row('ann', { delivery, scheduledAt: at('2026-11-12T15:00:00Z') })
  const gone = (left: ReminderRow) =>
    Change.Remove({ rowId: left.id, userId: 'ann', why: 'not-in-audience' })
  const inherited = Change.Put({
    userId: 'alex',
    plantId: 'plant-1',
    type: 'watering_reminder',
    occasion: TODAY,
    scheduledAt: at('2026-11-12T15:00:00Z'),
  })

  it.each([
    ['pending', Delivery.Pending({ retrying: false })],
    ['queued', Delivery.Queued()],
  ])(
    'hands a %s row of the last tender to the new one once their own send time has passed',
    (_, delivery) => {
      const left = leftBy(delivery)
      const state = plant({ rows: [left] })
      expect(planPlant(state, people(alex, ann), AFTER_SEND_TIME)).toEqual([
        inherited,
        gone(left),
      ])
    }
  )

  it('reminds the new tender at their own send time while it is ahead', () => {
    const left = leftBy()
    const state = plant({ rows: [left] })
    expect(planPlant(state, people(alex, ann), NOW)).toEqual([
      put(alex, TODAY),
      gone(left),
    ])
  })

  it('hands nothing over when the new tender was already reminded of the due day', () => {
    const left = leftBy()
    const state = plant({
      rows: [left, row('alex', { delivery: Delivery.Sent() })],
    })
    expect(planPlant(state, people(alex, ann), AFTER_SEND_TIME)).toEqual([
      gone(left),
    ])
  })

  it('hands nothing over when the new tender already holds a row for the due day', () => {
    const left = leftBy()
    const late = row('alex', { scheduledAt: at('2026-11-12T16:00:00Z') })
    const state = plant({ rows: [left, late] })
    expect(planPlant(state, people(alex, ann), AFTER_SEND_TIME)).toEqual([
      gone(left),
    ])
  })

  it('hands over the earliest of several rows left for the due day', () => {
    const later = row('ann', { scheduledAt: at('2026-11-12T16:00:00Z') })
    const left = leftBy()
    const state = plant({ rows: [later, left] })
    expect(planPlant(state, people(alex, ann), AFTER_SEND_TIME)).toEqual([
      inherited,
      gone(later),
      gone(left),
    ])
  })

  it('hands nothing over for a row a worker holds or one already sent', () => {
    for (const delivery of [Delivery.InFlight(), Delivery.Sent()]) {
      const state = plant({ rows: [leftBy(delivery)] })
      expect(planPlant(state, people(alex, ann), AFTER_SEND_TIME)).toEqual([])
    }
  })

  it('hands nothing over for an overdue due day or from another occasion', () => {
    const overdue = row('ann', { occasion: YESTERDAY })
    expect(
      planPlant(
        plant({ lines: [line('watering', YESTERDAY)], rows: [overdue] }),
        people(alex, ann),
        AFTER_SEND_TIME
      )
    ).toEqual([gone(overdue)])
    const stale = row('ann', { occasion: YESTERDAY })
    expect(
      planPlant(plant({ rows: [stale] }), people(alex, ann), AFTER_SEND_TIME)
    ).toEqual([gone(stale)])
  })

  it('hands nothing over to another care type', () => {
    const misting = row('ann', { type: 'misting_reminder' })
    expect(
      planPlant(plant({ rows: [misting] }), people(alex, ann), AFTER_SEND_TIME)
    ).toEqual([gone(misting)])
  })

  it('hands nothing over on a Canopy plant: a leaver takes their reminder with them', () => {
    const left = leftBy()
    const state = plant({ shared: true, rows: [left] })
    expect(planPlant(state, people(alex, ann), AFTER_SEND_TIME)).toEqual([
      gone(left),
    ])
  })

  it('hands nothing over from someone still in the audience who turned reminders off', () => {
    const muted = recipient('ann', { careReminders: false })
    const left = leftBy()
    const state = plant({ audience: ['alex', 'ann'], rows: [left] })
    expect(planPlant(state, people(alex, muted), AFTER_SEND_TIME)).toEqual([
      Change.Remove({
        rowId: left.id,
        userId: 'ann',
        why: 'care-reminders-off',
      }),
    ])
  })
})

describe('planPlant, fixpoint', () => {
  const dueDays = [
    day('2026-11-05'),
    YESTERDAY,
    TODAY,
    TOMORROW,
    day('2026-11-19'),
  ]
  const deliveries = [
    Delivery.Pending({ retrying: false }),
    Delivery.Pending({ retrying: true }),
    Delivery.Queued(),
    Delivery.InFlight(),
    Delivery.Sent(),
    Delivery.Failed(),
  ]
  const types: ReadonlyArray<ReminderType> = [
    'watering_reminder',
    'misting_reminder',
    'overdue_reminder',
  ]
  const users = ['alex', 'lily', 'sam']
  const times = [
    at('2026-11-12T07:00:00Z'),
    at('2026-11-12T09:00:00Z'),
    at('2026-11-13T09:00:00Z'),
    at('2026-11-13T12:00:00Z'),
  ]

  const generator = (seed: number) => {
    let state = seed
    const next = () => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) & 0x7fffffff
      return state >>> 16
    }
    return {
      pick: <A>(values: ReadonlyArray<A>): A =>
        values[next() % values.length] as A,
      chance: (oneIn: number) => next() % oneIn === 0,
      upTo: (max: number) => next() % (max + 1),
    }
  }

  const scenario = (seed: number) => {
    const random = generator(seed)
    const lily = recipient('lily', {
      hour: 18,
      active: !random.chance(6),
      careReminders: !random.chance(6),
    })
    const state = plant({
      living: !random.chance(8),
      remindersEnabled: !random.chance(8),
      shared: random.chance(2),
      audience: Array.filter(users, () => !random.chance(3)),
      lines: Array.filter(
        [
          line('watering', random.pick(dueDays)),
          line('misting', random.pick(dueDays)),
        ],
        () => !random.chance(5)
      ),
      rows: Array.makeBy(random.upTo(8), () => {
        const type = random.pick(types)
        return row(random.pick(users), {
          type,
          delivery: random.pick(deliveries),
          scheduledAt: random.pick(times),
          occasion: type === 'overdue_reminder' ? null : random.pick(dueDays),
        })
      }),
    })
    return {
      state,
      recipients: people(alex, lily),
      now: random.pick([NOW, at('2026-11-12T12:00:00Z')]),
    }
  }

  it('planning the result of a plan changes nothing', () => {
    const seeds = Array.makeBy(2000, (index) => index + 1)
    const unstable = Array.filter(seeds, (seed) => {
      const { state, recipients, now } = scenario(seed)
      const settled = afterApplying(state, planPlant(state, recipients, now))
      return planPlant(settled, recipients, now).length > 0
    })
    expect(unstable).toEqual([])
  })

  it('leaves at most one pending row per slot and never touches a row in flight', () => {
    const seeds = Array.makeBy(2000, (index) => index + 1)
    const broken = Array.filter(seeds, (seed) => {
      const { state, recipients, now } = scenario(seed)
      const changes = planPlant(state, recipients, now)
      const settled = afterApplying(state, changes)
      const slots = pipe(
        settled.rows,
        Array.filter(
          (r) => r.delivery._tag === 'Pending' && r.type !== 'overdue_reminder'
        ),
        Array.map((r) => `${r.userId}:${r.type}`)
      )
      const touched = Array.flatMap(changes, (change) =>
        Change.$match(change, {
          Remove: ({ rowId }) => [rowId],
          Retime: ({ rowId }) => [rowId],
          Put: () => [],
        })
      )
      const inFlight = pipe(
        state.rows,
        Array.filter((r) => r.delivery._tag === 'InFlight'),
        Array.map((r) => r.id)
      )
      return (
        Array.dedupe(slots).length !== slots.length ||
        Array.some(inFlight, (id) => Array.contains(touched, id))
      )
    })
    expect(broken).toEqual([])
  })
})
