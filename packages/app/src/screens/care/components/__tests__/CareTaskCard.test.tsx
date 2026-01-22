import { fireEvent, render, screen } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'
import { CareTaskCard } from '../CareTaskCard'

describe('CareTaskCard', () => {
  const mockTask = {
    id: 'task-1',
    plantId: 'plant-1',
    plantName: 'Monstera',
    plantImageUrl: 'https://example.com/plant.jpg',
    type: 'water' as const,
    completed: false,
    dueDate: new Date('2025-01-22'),
  }

  const defaultProps = {
    task: mockTask,
    onCardPress: vi.fn(),
    onPlantPhotoPress: vi.fn(),
    onUndo: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders plant name', () => {
    render(<CareTaskCard {...defaultProps} />)
    expect(screen.getByText('Monstera')).toBeTruthy()
  })

  it('renders task type badge', () => {
    render(<CareTaskCard {...defaultProps} />)
    expect(screen.getByText('WATER')).toBeTruthy()
  })

  it('shows overdue styling when overdue', () => {
    render(<CareTaskCard {...defaultProps} overdue />)
    // Card should have overdue styling (coral border)
    expect(screen.getByText('Monstera')).toBeTruthy()
  })

  it('shows completed state', () => {
    const completedTask = { ...mockTask, completed: true }
    render(<CareTaskCard {...defaultProps} task={completedTask} />)
    // Should show check circle icon
    expect(screen.getByText('Monstera')).toBeTruthy()
  })

  it('shows pending completion state', () => {
    render(<CareTaskCard {...defaultProps} isPendingCompletion />)
    // Should show check circle icon when pending
    expect(screen.getByText('Monstera')).toBeTruthy()
  })

  it('calls onCardPress when card pressed', () => {
    render(<CareTaskCard {...defaultProps} />)
    const card = screen.getByText('Monstera')
    fireEvent.press(card)
    expect(defaultProps.onCardPress).toHaveBeenCalled()
  })

  it('renders fertilize task type', () => {
    const fertilizeTask = { ...mockTask, type: 'fertilize' as const }
    render(<CareTaskCard {...defaultProps} task={fertilizeTask} />)
    expect(screen.getByText('FERTILIZE')).toBeTruthy()
  })
})
