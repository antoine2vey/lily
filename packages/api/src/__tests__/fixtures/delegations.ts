import type { DelegationRow } from '@lily/api/repositories/delegation.repository'

export const mockDelegation1: DelegationRow = {
  id: 'delegation-1',
  ownerId: 'user-1',
  caretakerId: 'user-2',
  status: 'pending',
  message: 'Please water my plants while I am away',
  startDate: new Date('2024-06-01'),
  endDate: new Date('2024-06-14'),
  respondedAt: null,
  canceledAt: null,
  completedAt: null,
  createdAt: new Date('2024-05-20'),
  updatedAt: new Date('2024-05-20'),
}

export const mockDelegation2: DelegationRow = {
  id: 'delegation-2',
  ownerId: 'user-1',
  caretakerId: 'user-3',
  status: 'active',
  message: null,
  startDate: new Date('2024-07-01'),
  endDate: new Date('2024-07-10'),
  respondedAt: new Date('2024-06-25'),
  canceledAt: null,
  completedAt: null,
  createdAt: new Date('2024-06-20'),
  updatedAt: new Date('2024-07-01'),
}

export const mockDelegationPlants = [
  {
    id: 'plant-1',
    name: 'Monstera',
    imageUrl: 'https://example.com/monstera.jpg',
    nextWateringAt: new Date('2024-06-05'),
    health: 'HEALTHY',
  },
  {
    id: 'plant-2',
    name: 'Fern',
    imageUrl: null,
    nextWateringAt: new Date('2024-06-03'),
    health: 'NEEDS_ATTENTION',
  },
]
