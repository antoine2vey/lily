import { fireEvent, render, screen } from '@testing-library/react-native'

const mockAccept = jest.fn()
const mockDismiss = jest.fn()
let mockPlans: Array<{ id: string; status: string; steps: unknown[] }> = []

jest.mock('@/hooks/useCarePlans', () => ({
  usePlantCarePlans: jest.fn(() => ({ data: { items: mockPlans } })),
}))

jest.mock('@/hooks/useCarePlanMutations', () => ({
  useAcceptCarePlan: jest.fn(() => ({ mutate: mockAccept, isPending: false })),
  useDismissCarePlan: jest.fn(() => ({
    mutate: mockDismiss,
    isPending: false,
  })),
}))

import { CarePlanCard } from '../components/CarePlanCard'

const steps = [
  { title: 'Hold off watering', careType: 'watering' as const, dueInDays: 5 },
  { title: 'Move away from the window' },
]

describe('CarePlanCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPlans = []
  })

  it('renders the proposal with its steps and an add-to-tasks action', () => {
    render(
      <CarePlanCard
        carePlanId="plan-1"
        title="Recover from overwatering"
        steps={steps}
        plantId="plant-1"
      />
    )

    expect(screen.getByText('Recover from overwatering')).toBeTruthy()
    expect(screen.getByText('Hold off watering')).toBeTruthy()
    expect(screen.getByText('Move away from the window')).toBeTruthy()

    fireEvent.press(screen.getByTestId('care-plan-card-plan-1-accept'))
    expect(mockAccept).toHaveBeenCalledWith({ path: { planId: 'plan-1' } })
  })

  it('offers a dismiss action while proposed', () => {
    render(
      <CarePlanCard
        carePlanId="plan-1"
        title="Recover"
        steps={steps}
        plantId="plant-1"
      />
    )

    fireEvent.press(screen.getByTestId('care-plan-card-plan-1-dismiss'))
    expect(mockDismiss).toHaveBeenCalledWith({ path: { planId: 'plan-1' } })
  })

  it('shows the added state once the server reports the plan as accepted', () => {
    mockPlans = [
      {
        id: 'plan-1',
        status: 'accepted',
        steps: [
          {
            id: 's1',
            planId: 'plan-1',
            position: 0,
            title: 'Hold off watering',
            careType: 'watering',
            completedAt: new Date('2024-01-02'),
          },
          {
            id: 's2',
            planId: 'plan-1',
            position: 1,
            title: 'Move away from the window',
          },
        ],
      },
    ]

    render(
      <CarePlanCard
        carePlanId="plan-1"
        title="Recover"
        steps={steps}
        plantId="plant-1"
      />
    )

    expect(screen.getByText('Added to tasks')).toBeTruthy()
    expect(screen.queryByTestId('care-plan-card-plan-1-accept')).toBeNull()
  })
})
