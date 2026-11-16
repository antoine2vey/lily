import type { CarePlan } from '@lily/shared/care-plan'

// The API client rejects ids that are not UUIDs before sending a request.
export const carePlanIds = {
  plan: '7d3c1a52-0f4e-4b8a-9c61-2e5f8b9d0a11',
  plant: '1b9e6f3a-5c2d-4e7f-8a90-3d4c5b6a7e22',
  openStep: 'a4f2c8e1-6b3d-4c9a-8e57-1f2a3b4c5d33',
  doneStep: 'c6e8a0b2-4d1f-4a3c-9b75-5e6f7a8b9c44',
} as const

// One accepted plan with an open care-typed step and a done free-text step.
export const mockCarePlan: CarePlan = {
  id: carePlanIds.plan,
  plantId: carePlanIds.plant,
  plantName: 'Monstera',
  plantImageUrl: null,
  userId: 'user-1',
  title: 'Recover from overwatering',
  source: 'ai',
  status: 'accepted',
  steps: [
    {
      id: carePlanIds.openStep,
      planId: carePlanIds.plan,
      position: 0,
      title: 'Water lightly',
      careType: 'watering',
    },
    {
      id: carePlanIds.doneStep,
      planId: carePlanIds.plan,
      position: 1,
      title: 'Move away from the window',
      completedAt: new Date('2024-01-02'),
    },
  ],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

export const carePlansListKey = [
  'carePlans',
  'getCarePlans',
  { query: { status: 'accepted' } },
]

export const plantCarePlansKey = [
  'carePlans',
  'getPlantCarePlans',
  { params: { plantId: carePlanIds.plant } },
]
