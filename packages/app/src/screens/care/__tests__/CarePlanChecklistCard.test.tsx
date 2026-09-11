import type { CarePlan } from '@lily/shared/care-plan'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { CarePlanChecklistCard } from '../components/CarePlanChecklistCard'

const plan: CarePlan = {
  id: 'plan-1',
  plantId: 'plant-1',
  plantName: 'Monstera Deliciosa',
  plantImageUrl: null,
  userId: 'user-1',
  title: 'Recover from overwatering',
  source: 'ai',
  status: 'accepted',
  steps: [
    {
      id: 'step-1',
      planId: 'plan-1',
      position: 0,
      title: 'Hold off watering',
      careType: 'watering',
      dueDate: new Date('2030-01-01'),
    },
    {
      id: 'step-2',
      planId: 'plan-1',
      position: 1,
      title: 'Move away from the window',
      completedAt: new Date('2024-01-02'),
    },
  ],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

describe('CarePlanChecklistCard', () => {
  const onStepPress = jest.fn()
  const onStepUndo = jest.fn()
  const onDeletePlan = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the plan title, plant name and progress', () => {
    render(
      <CarePlanChecklistCard
        plan={plan}
        showPlant
        pendingStepIds={new Set()}
        onStepPress={onStepPress}
        onStepUndo={onStepUndo}
      />
    )

    expect(screen.getByText('Recover from overwatering')).toBeTruthy()
    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
    expect(screen.getByText('Hold off watering')).toBeTruthy()
    expect(screen.getByText('Move away from the window')).toBeTruthy()
    expect(screen.getByText(/1 of 2/)).toBeTruthy()
  })

  it('reports the tapped step', () => {
    render(
      <CarePlanChecklistCard
        plan={plan}
        pendingStepIds={new Set()}
        onStepPress={onStepPress}
        onStepUndo={onStepUndo}
      />
    )

    fireEvent.press(screen.getByTestId('care-plan-step-step-1'))
    expect(onStepPress).toHaveBeenCalledWith(plan.steps[0])
  })

  it('shows the undo control for a pending step and ignores taps on it', () => {
    render(
      <CarePlanChecklistCard
        plan={plan}
        pendingStepIds={new Set(['step-1'])}
        onStepPress={onStepPress}
        onStepUndo={onStepUndo}
      />
    )

    fireEvent.press(screen.getByTestId('care-plan-step-step-1'))
    expect(onStepPress).not.toHaveBeenCalled()
    expect(screen.getByText('Undo ?')).toBeTruthy()
  })

  it('exposes a delete action when a handler is provided', () => {
    render(
      <CarePlanChecklistCard
        plan={plan}
        pendingStepIds={new Set()}
        onStepPress={onStepPress}
        onStepUndo={onStepUndo}
        onDeletePlan={onDeletePlan}
      />
    )

    fireEvent.press(screen.getByTestId('care-plan-plan-1-delete'))
    expect(onDeletePlan).toHaveBeenCalledTimes(1)
  })
})
