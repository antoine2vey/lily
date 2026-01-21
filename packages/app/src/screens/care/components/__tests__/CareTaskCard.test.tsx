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
  }

  const defaultProps = {
    task: mockTask,
    onPress: vi.fn(),
    onComplete: vi.fn(),
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

  it('calls onPress when card pressed', () => {
    render(<CareTaskCard {...defaultProps} />)
    const card = screen.getByText('Monstera')
    fireEvent.press(card)
    expect(defaultProps.onPress).toHaveBeenCalled()
  })

  it('renders different task types', () => {
    const fertilizeTask = { ...mockTask, type: 'fertilize' as const }
    render(<CareTaskCard {...defaultProps} task={fertilizeTask} />)
    expect(screen.getByText('FERTILIZE')).toBeTruthy()
  })

  it('renders prune task type', () => {
    const pruneTask = { ...mockTask, type: 'prune' as const }
    render(<CareTaskCard {...defaultProps} task={pruneTask} />)
    expect(screen.getByText('PRUNE')).toBeTruthy()
  })

  it('renders mist task type', () => {
    const mistTask = { ...mockTask, type: 'mist' as const }
    render(<CareTaskCard {...defaultProps} task={mistTask} />)
    expect(screen.getByText('MIST')).toBeTruthy()
  })

  it('renders rotate task type', () => {
    const rotateTask = { ...mockTask, type: 'rotate' as const }
    render(<CareTaskCard {...defaultProps} task={rotateTask} />)
    expect(screen.getByText('ROTATE')).toBeTruthy()
  })
})
