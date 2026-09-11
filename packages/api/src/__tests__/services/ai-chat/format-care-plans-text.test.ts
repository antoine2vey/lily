import { formatCarePlansText } from '@lily/api/services/ai-chat/build-system-prompt'
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
    expect(formatCarePlansText([basePlan({ status: 'proposed' })])).toBe('')
  })

  it('lists open steps of accepted plans and recently completed ones', () => {
    const text = formatCarePlansText([
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
    ])
    expect(text).toContain(
      '[ ] Repot (care: repotting, due 2024-01-05) [plan: Recovery]'
    )
    expect(text).toContain(
      '[x] Check leaves (done 2024-01-03) [plan: Recovery]'
    )
  })
})
