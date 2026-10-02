import type { CareTask, CareTasksResponse, CareType } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import i18n from '@/i18n'
import {
  buildTodayWidgetSnapshot,
  makeTodayWidgetCopy,
  type TodayWidgetCopy,
} from '@/widgets/today/build-snapshot'
import type {
  TodayWidgetDay,
  TodayWidgetSnapshot,
} from '@/widgets/today/snapshot'

const stubCopy: TodayWidgetCopy = {
  title: 'title',
  needsCare: (n) => `needs:${n}`,
  needsCareCaption: (n) => `caption:${n}`,
  morePlants: (n) => `more:${n}`,
  allDone: 'allDone',
  nextCareIn: (n) => `next:${n}`,
  nothingDue: 'nothingDue',
  careAction: (type) => `act:${type}`,
  daysLate: (n) => `late:${n}`,
  stale: 'stale',
  signedOut: 'signedOut',
}

const WINDOW_ACROSS_PARIS_SPRING_FORWARD = [
  '2026-03-26',
  '2026-03-27',
  '2026-03-28',
  '2026-03-29',
  '2026-03-30',
  '2026-03-31',
  '2026-04-01',
  '2026-04-02',
]

const task = (
  overrides: Partial<CareTask> & { readonly dueDayOffset: number }
): CareTask => {
  const plantId = pipe(
    Option.fromNullishOr(overrides.plantId),
    Option.getOrElse(() => 'plant-a')
  )
  const type: CareType = pipe(
    Option.fromNullishOr(overrides.type),
    Option.getOrElse((): CareType => 'watering')
  )
  return {
    id: `${plantId}-${type}`,
    plantId,
    plantName: 'Monstera',
    plantImageUrl: null,
    roomName: null,
    roomIcon: null,
    type,
    dueDate: new Date('2026-03-26T08:00:00.000Z'),
    localDueDate: '2026-03-26',
    completed: false,
    ...overrides,
  }
}

const response = (
  overrides: Partial<CareTasksResponse> = {}
): CareTasksResponse => ({
  overdue: [],
  today: [],
  upcoming: [],
  completedToday: 0,
  windowDays: WINDOW_ACROSS_PARIS_SPRING_FORWARD,
  ...overrides,
})

const ready = (
  tasks: CareTasksResponse,
  timezone = 'Europe/Paris'
): Option.Option<TodayWidgetSnapshot> =>
  buildTodayWidgetSnapshot({ _tag: 'Ready', tasks, timezone }, stubCopy)

const daysOf = (
  snapshot: Option.Option<TodayWidgetSnapshot>
): ReadonlyArray<TodayWidgetDay> =>
  pipe(
    snapshot,
    Option.flatMap((s) =>
      s._tag === 'Ready' ? Option.some(s.days) : Option.none()
    ),
    Option.getOrElse((): ReadonlyArray<TodayWidgetDay> => [])
  )

const dayAt = (
  snapshot: Option.Option<TodayWidgetSnapshot>,
  index: number
): TodayWidgetDay =>
  pipe(
    Array.get(daysOf(snapshot), index),
    Option.getOrThrowWith(() => new Error(`no day ${index}`))
  )

describe('buildTodayWidgetSnapshot', () => {
  it('renders SignedOut copy verbatim', () => {
    expect(
      buildTodayWidgetSnapshot({ _tag: 'SignedOut' }, stubCopy)
    ).toStrictEqual(
      Option.some({
        _tag: 'SignedOut',
        v: 1,
        title: 'title',
        message: 'signedOut',
      })
    )
  })

  it('keeps the file on disk when the server window is empty or malformed', () => {
    expect(ready(response({ windowDays: [] }))).toStrictEqual(Option.none())
    expect(
      ready(response({ windowDays: ['2026-03-26', 'garbage'] }))
    ).toStrictEqual(Option.none())
    expect(ready(response(), 'Not/AZone')).toStrictEqual(Option.none())
  })

  it('emits one day per window key, anchored at each local midnight', () => {
    const snapshot = ready(response())
    expect(
      Array.map(daysOf(snapshot), (d) => new Date(d.startsAt).toISOString())
    ).toStrictEqual([
      '2026-03-25T23:00:00.000Z',
      '2026-03-26T23:00:00.000Z',
      '2026-03-27T23:00:00.000Z',
      '2026-03-28T23:00:00.000Z',
      '2026-03-29T22:00:00.000Z',
      '2026-03-30T22:00:00.000Z',
      '2026-03-31T22:00:00.000Z',
      '2026-04-01T22:00:00.000Z',
    ])
    expect(
      pipe(
        snapshot,
        Option.map((s) =>
          s._tag === 'Ready' ? new Date(s.staleAt).toISOString() : s._tag
        )
      )
    ).toStrictEqual(Option.some('2026-04-02T22:00:00.000Z'))
  })

  it('rolls a task due tomorrow into today at midnight, then marks it late', () => {
    const snapshot = ready(response({ upcoming: [task({ dueDayOffset: 1 })] }))
    expect(dayAt(snapshot, 0)).toMatchObject({
      status: 'clear',
      headline: 'next:1',
      rows: [],
    })
    expect(dayAt(snapshot, 1)).toMatchObject({ status: 'due', overdueCount: 0 })
    expect(dayAt(snapshot, 1).rows[0]?.lateLabel).toBeNull()
    expect(dayAt(snapshot, 2).rows[0]?.lateLabel).toBe('late:1')
    expect(dayAt(snapshot, 2).overdueCount).toBe(1)
    expect(dayAt(snapshot, 7).rows[0]?.lateLabel).toBe('late:6')
  })

  it('counts lateness from the server offset for already-overdue tasks', () => {
    const snapshot = ready(response({ overdue: [task({ dueDayOffset: -3 })] }))
    expect(dayAt(snapshot, 0).rows[0]?.lateLabel).toBe('late:3')
    expect(dayAt(snapshot, 1).rows[0]?.lateLabel).toBe('late:4')
  })

  it('groups tasks by plant, ordering care types and taking the oldest lateness', () => {
    const snapshot = ready(
      response({
        overdue: [task({ type: 'misting', dueDayOffset: -2 })],
        today: [
          task({ type: 'watering', dueDayOffset: 0 }),
          task({
            plantId: 'plant-b',
            plantName: 'Fern',
            type: 'repotting',
            dueDayOffset: 0,
          }),
        ],
      })
    )
    const today = dayAt(snapshot, 0)

    expect(today.plantCount).toBe(2)
    expect(today.headline).toBe('needs:2')
    expect(today.rows).toStrictEqual([
      {
        plantId: 'plant-a',
        plantName: 'Monstera',
        careTypes: ['watering', 'misting'],
        detail: 'act:watering · act:misting',
        lateLabel: 'late:2',
      },
      {
        plantId: 'plant-b',
        plantName: 'Fern',
        careTypes: ['repotting'],
        detail: 'act:repotting',
        lateLabel: null,
      },
    ])
  })

  it('sorts most-late plants first, then by name', () => {
    const snapshot = ready(
      response({
        today: [
          task({ plantId: 'z', plantName: 'Zamioculcas', dueDayOffset: 0 }),
          task({ plantId: 'a', plantName: 'aloe', dueDayOffset: 0 }),
        ],
        overdue: [
          task({ plantId: 'p', plantName: 'Pothos', dueDayOffset: -1 }),
        ],
      })
    )
    expect(
      Array.map(dayAt(snapshot, 0).rows, (r) => r.plantName)
    ).toStrictEqual(['Pothos', 'aloe', 'Zamioculcas'])
  })

  it('caps rows while still counting every plant', () => {
    const plants = Array.makeBy(6, (i) =>
      task({ plantId: `p${i}`, plantName: `Plant ${i}`, dueDayOffset: 0 })
    )
    const today = dayAt(ready(response({ today: plants })), 0)
    expect(today.plantCount).toBe(6)
    expect(today.rows).toHaveLength(4)
    expect(today.caption).toBe('caption:6')
    expect(today.moreLabels).toStrictEqual([
      'more:5',
      'more:4',
      'more:3',
      'more:2',
    ])
  })

  it('distinguishes allDone (work done today) from clear (nothing was due)', () => {
    const doneToday = ready(response({ completedToday: 2 }))
    expect(dayAt(doneToday, 0)).toMatchObject({
      status: 'allDone',
      headline: 'allDone',
      caption: 'allDone',
      completedCount: 2,
      moreLabels: [],
    })
    expect(dayAt(doneToday, 1)).toMatchObject({
      status: 'clear',
      headline: 'nothingDue',
      completedCount: 0,
    })
  })

  it('keeps progress on a due day that already has completions', () => {
    const snapshot = ready(
      response({ today: [task({ dueDayOffset: 0 })], completedToday: 3 })
    )
    expect(dayAt(snapshot, 0)).toMatchObject({
      status: 'due',
      completedCount: 3,
    })
  })

  it('says when the next care is due on a clear day', () => {
    const snapshot = ready(
      response({
        upcoming: [
          task({ dueDayOffset: 3 }),
          task({ plantId: 'b', dueDayOffset: 5 }),
        ],
      })
    )
    expect(dayAt(snapshot, 0).headline).toBe('next:3')
    expect(dayAt(snapshot, 2).headline).toBe('next:1')
    expect(dayAt(snapshot, 3).headline).toBe('needs:1')
  })
})

describe('makeTodayWidgetCopy', () => {
  it('renders ICU plurals in English and French', () => {
    const en = makeTodayWidgetCopy(i18n.getFixedT('en', 'care'))
    const fr = makeTodayWidgetCopy(i18n.getFixedT('fr', 'care'))

    expect([en.needsCare(1), en.needsCare(3)]).toStrictEqual([
      '1 plant needs care',
      '3 plants need care',
    ])
    expect([en.nextCareIn(1), en.nextCareIn(4)]).toStrictEqual([
      'Next care tomorrow',
      'Next care in 4 days',
    ])
    expect([fr.daysLate(1), fr.daysLate(2)]).toStrictEqual([
      '1 jour de retard',
      '2 jours de retard',
    ])
    expect(fr.careAction('misting')).toBe('Vaporiser')
    expect([fr.needsCareCaption(1), fr.needsCareCaption(5)]).toStrictEqual([
      'plante à soigner',
      'plantes à soigner',
    ])
    expect([fr.morePlants(1), fr.morePlants(3)]).toStrictEqual([
      '+1 plante',
      '+3 plantes',
    ])
    expect(en.morePlants(2)).toBe('+2 plants')
  })
})
