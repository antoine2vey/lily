import type { CareTask, CareType } from '@lily/shared'
import { render, screen } from '@testing-library/react-native'
import { WeeklySchedule } from '../components/WeeklySchedule'

// 8-day axis (today + 7), days 15..22 — chosen so the day numbers don't collide
// with the small task counts asserted below.
const WINDOW_DAYS = [
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
  '2026-06-22',
]

let taskSeq = 0
const makeTask = (
  type: CareType,
  dueDayOffset: number,
  localDueDate: string
): CareTask => {
  taskSeq += 1
  return {
    id: `task-${taskSeq}`,
    plantId: `plant-${taskSeq}`,
    plantName: 'Test Plant',
    plantImageUrl: null,
    roomName: null,
    roomIcon: null,
    type,
    dueDate: new Date(`${localDueDate}T12:00:00Z`),
    dueDayOffset,
    localDueDate,
    completed: false,
  }
}

describe('WeeklySchedule', () => {
  beforeEach(() => {
    taskSeq = 0
  })

  it('renders one column per window day, including the +7 day that used to be dropped', () => {
    render(
      <WeeklySchedule
        overdue={[]}
        today={[]}
        upcoming={[]}
        windowDays={WINDOW_DAYS}
      />
    )

    // Today column day number (windowDays[0] = the 15th)
    expect(screen.getByText('15')).toBeTruthy()
    // The +7 column (windowDays[7] = the 22nd) — previously had no column at all
    expect(screen.getByText('22')).toBeTruthy()
  })

  it('caps dots at 3 and shows a +N overflow so high counts do not alias to 3', () => {
    // 5 watering tasks due today (offset 0) → 3 dots + "+2"
    const today = [
      makeTask('watering', 0, '2026-06-15'),
      makeTask('watering', 0, '2026-06-15'),
      makeTask('watering', 0, '2026-06-15'),
      makeTask('watering', 0, '2026-06-15'),
      makeTask('watering', 0, '2026-06-15'),
    ]

    render(
      <WeeklySchedule
        overdue={[]}
        today={today}
        upcoming={[]}
        windowDays={WINDOW_DAYS}
      />
    )

    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('surfaces overdue as a distinct badge instead of inflating the today column', () => {
    const overdue = [
      makeTask('watering', -2, '2026-06-13'),
      makeTask('fertilization', -1, '2026-06-14'),
    ]

    render(
      <WeeklySchedule
        overdue={overdue}
        today={[]}
        upcoming={[]}
        windowDays={WINDOW_DAYS}
      />
    )

    // The today column shows the overdue count (2) as its own coral badge.
    expect(screen.getByText('2')).toBeTruthy()
  })
})
