import { formatCarePlansText } from '@lily/api/services/ai-chat/build-system-prompt'
import { ZoneName } from '@lily/shared'
import type { CarePlan } from '@lily/shared/care-plan'
import { describe, expect, it } from 'vitest'

const basePlan = (overrides: Partial<CarePlan>): CarePlan => ({
  id: 'plan-1',
  plantId: 'plant-1',
  plantName: 'Monstera',
  plantImageUrl: null,
  userId: 'user-1',
  title: 'Recovery',
  source: 'ai',
  status: 'accepted',
  steps: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

describe('formatCarePlansText', () => {
  it('returns an empty string when no plan was accepted', () => {
    expect(
      formatCarePlansText(
        [basePlan({ status: 'proposed' })],
        ZoneName.make('UTC')
      )
    ).toBe('')
  })

  it('lists open steps of accepted plans and recently completed ones', () => {
    const text = formatCarePlansText(
      [
        basePlan({
          steps: [
            {
              id: 's1',
              planId: 'plan-1',
              position: 0,
              title: 'Repot',
              careType: 'repotting',
              dueDate: new Date('2024-01-05'),
            },
            {
              id: 's2',
              planId: 'plan-1',
              position: 1,
              title: 'Check leaves',
              completedAt: new Date('2024-01-03'),
            },
          ],
        }),
      ],
      ZoneName.make('UTC')
    )
    expect(text).toContain(
      '[ ] Repot (care: repotting, due 2024-01-05) [plan: Recovery]'
    )
    expect(text).toContain(
      '[x] Check leaves (done 2024-01-03) [plan: Recovery]'
    )
  })

  // `resolveDueDate` stores a due day as the local midnight that starts it.
  it.each([
    {
      zone: 'Europe/Paris',
      dueDate: '2026-10-25T23:00:00Z',
      completedAt: '2026-10-24T22:30:00Z',
      line: '[x] Repot (care: repotting, due 2026-10-26, done 2026-10-25)',
    },
    {
      zone: 'Europe/London',
      dueDate: '2026-06-10T23:00:00Z',
      completedAt: '2026-06-10T23:30:00Z',
      line: '[x] Repot (care: repotting, due 2026-06-11, done 2026-06-11)',
    },
    {
      zone: 'America/New_York',
      dueDate: '2026-06-11T04:00:00Z',
      completedAt: '2026-06-11T02:00:00Z',
      line: '[x] Repot (care: repotting, due 2026-06-11, done 2026-06-10)',
    },
  ])('prints the $zone day of a due date and a completion', (row) => {
    const text = formatCarePlansText(
      [
        basePlan({
          steps: [
            {
              id: 's1',
              planId: 'plan-1',
              position: 0,
              title: 'Repot',
              careType: 'repotting',
              dueDate: new Date(row.dueDate),
              completedAt: new Date(row.completedAt),
            },
          ],
        }),
      ],
      ZoneName.make(row.zone)
    )
    expect(text).toContain(row.line)
  })
})
