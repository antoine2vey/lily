import type {
  CarePlanRow,
  CarePlanStepRow,
} from '@lily/api/repositories/care-plan.repository'

export const createTestCarePlan = (
  overrides: Partial<CarePlanRow> = {}
): CarePlanRow => ({
  id: `care-plan-${crypto.randomUUID()}`,
  plantId: 'plant-1',
  userId: 'user-1',
  chatMessageId: null,
  diagnosisId: null,
  title: 'Recovery plan',
  source: 'ai',
  status: 'proposed',
  acceptedAt: null,
  completedAt: null,
  createdAt: new Date('2024-01-10'),
  updatedAt: new Date('2024-01-10'),
  ...overrides,
})

export const createTestCarePlanStep = (
  planId: string,
  overrides: Partial<CarePlanStepRow> = {}
): CarePlanStepRow => ({
  id: `care-plan-step-${crypto.randomUUID()}`,
  planId,
  position: 0,
  title: 'Check the leaves',
  description: null,
  careType: null,
  dueDate: null,
  completedAt: null,
  careLogId: null,
  createdAt: new Date('2024-01-10'),
  updatedAt: new Date('2024-01-10'),
  ...overrides,
})
