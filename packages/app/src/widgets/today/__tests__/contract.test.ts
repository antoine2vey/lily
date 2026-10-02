import fs from 'node:fs'
import path from 'node:path'
import { Array } from 'effect'
import {
  encodeTodayWidgetSnapshot,
  type TodayWidgetSnapshot,
} from '@/widgets/today/snapshot'

const CONTRACT_DIR = path.join(
  __dirname,
  '../../../../templates/LilyWidgetsExtension/Contract'
)

const MARCH_26_PARIS = Date.UTC(2026, 2, 25, 23)
const DAY_MS = 24 * 60 * 60 * 1000

const ready: TodayWidgetSnapshot = {
  _tag: 'Ready',
  v: 1,
  title: 'Today',
  days: [
    {
      startsAt: MARCH_26_PARIS,
      status: 'due',
      plantCount: 2,
      overdueCount: 1,
      completedCount: 1,
      headline: '2 plants need care',
      caption: 'plants need care',
      rows: [
        {
          plantId: 'plant-monstera',
          plantName: 'Monstera',
          careTypes: ['watering', 'misting'],
          detail: 'Water · Mist',
          lateLabel: '2 days late',
        },
        {
          plantId: 'plant-fern',
          plantName: 'Boston Fern',
          careTypes: ['fertilization'],
          detail: 'Fertilize',
          lateLabel: null,
        },
      ],
      moreLabels: ['+1 plant', null],
    },
    {
      startsAt: MARCH_26_PARIS + DAY_MS,
      status: 'allDone',
      plantCount: 0,
      overdueCount: 0,
      completedCount: 3,
      headline: 'All done for today',
      caption: 'All done for today',
      rows: [],
      moreLabels: [],
    },
    {
      startsAt: MARCH_26_PARIS + 2 * DAY_MS,
      status: 'clear',
      plantCount: 0,
      overdueCount: 0,
      completedCount: 0,
      headline: 'Next care tomorrow',
      caption: 'Next care tomorrow',
      rows: [],
      moreLabels: [],
    },
  ],
  staleAt: MARCH_26_PARIS + 3 * DAY_MS,
  staleMessage: 'Open Lily to refresh',
}

const signedOut: TodayWidgetSnapshot = {
  _tag: 'SignedOut',
  v: 1,
  title: 'Today',
  message: "Sign in to see today's care",
}

const CASES = [
  { file: 'today-widget.fixture.json', snapshot: ready },
  { file: 'today-widget-signed-out.fixture.json', snapshot: signedOut },
] as const

describe('Today widget contract', () => {
  if (process.env.UPDATE_WIDGET_CONTRACT === '1') {
    Array.forEach(CASES, ({ file, snapshot }) => {
      fs.writeFileSync(
        path.join(CONTRACT_DIR, file),
        `${JSON.stringify(JSON.parse(encodeTodayWidgetSnapshot(snapshot)), null, 2)}\n`
      )
    })
  }

  it.each(CASES)(
    'encodes the same JSON value as $file (a change needs a store build; regenerate with UPDATE_WIDGET_CONTRACT=1)',
    ({ file, snapshot }) => {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(CONTRACT_DIR, file), 'utf8')
      )
      expect(JSON.parse(encodeTodayWidgetSnapshot(snapshot))).toStrictEqual(
        fixture
      )
    }
  )

  it('encodes identical state to identical bytes', () => {
    expect(encodeTodayWidgetSnapshot(ready)).toBe(
      encodeTodayWidgetSnapshot(structuredClone(ready))
    )
  })
})
