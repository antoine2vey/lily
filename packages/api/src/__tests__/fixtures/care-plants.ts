import {
  type CareLine,
  type CarePlant,
  Frequency,
  LifeState,
} from '@lily/api/contexts/care/domain/care-plant'
import { CareDay, type CareType } from '@lily/shared'
import { Array, Option } from 'effect'

export const TEST_CARE_TODAY = CareDay.make('2026-11-12')

export const createTestCareLine = (
  careType: CareType,
  overrides: {
    readonly dueDay?: string
    readonly caredOn?: ReadonlyArray<string>
  } = {}
): CareLine => ({
  careType,
  schedule: Option.some({
    frequency: Frequency.make(7),
    dueDay: CareDay.make(overrides.dueDay ?? '2026-11-10'),
    startedOn: CareDay.make('2026-10-01'),
  }),
  history: Array.map(overrides.caredOn ?? [], (day, index) => ({
    id: `care-${careType}-${index}`,
    day: CareDay.make(day),
  })),
})

export const createTestCarePlant = (
  id: string,
  overrides: Partial<Omit<CarePlant, 'lines'>> & {
    readonly lines?: ReadonlyArray<CareLine>
  } = {}
): CarePlant => ({
  id,
  owner: { _tag: 'User', userId: 'user-1' },
  life: LifeState.Living(),
  timezone: 'UTC',
  today: TEST_CARE_TODAY,
  needsAttention: false,
  plans: [],
  ...overrides,
  lines: new Map(
    Array.map(overrides.lines ?? [createTestCareLine('watering')], (line) => [
      line.careType,
      line,
    ])
  ),
})
