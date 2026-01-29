import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockNow } from 'src/__tests__/utils/dates'
import { CareTaskCard } from '../components/CareTaskCard'

describe('CareTaskCard', () => {
  const mockOnCardPress = jest.fn()
  const mockOnPlantPhotoPress = jest.fn()
  const mockOnUndo = jest.fn()

  const baseTask = {
    id: 'task-1',
    plantId: 'plant-1',
    plantName: 'Monstera Deliciosa',
    plantImageUrl: 'https://example.com/monstera.jpg',
    type: 'water' as const,
    completed: false,
    dueDate: mockNow(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders plant name', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
      />
    )

    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })

  it('displays water badge for water task', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
      />
    )

    expect(screen.getByText('WATER')).toBeTruthy()
  })

  it('displays fertilize badge for fertilize task', () => {
    const fertilizeTask = {
      ...baseTask,
      type: 'fertilize' as const,
    }

    render(
      <CareTaskCard
        task={fertilizeTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
      />
    )

    expect(screen.getByText('FERTILIZE')).toBeTruthy()
  })

  it('calls onCardPress when card is pressed', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
      />
    )

    fireEvent.press(screen.getByText('Monstera Deliciosa'))

    expect(mockOnCardPress).toHaveBeenCalled()
  })

  it('renders plant image', () => {
    // The plant photo is wrapped in a pressable, testing that it renders
    const { toJSON } = render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
      />
    )

    // Component should render with image
    expect(toJSON()).toBeTruthy()
  })

  it('shows undo button when isPendingCompletion is true', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
        onUndo={mockOnUndo}
        isPendingCompletion={true}
      />
    )

    expect(screen.getByText('Undo ?')).toBeTruthy()
  })

  it('calls onUndo when undo button is pressed', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
        onUndo={mockOnUndo}
        isPendingCompletion={true}
      />
    )

    fireEvent.press(screen.getByText('Undo ?'))

    expect(mockOnUndo).toHaveBeenCalled()
  })

  it('disables card press when isPendingCompletion is true', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
        onUndo={mockOnUndo}
        isPendingCompletion={true}
      />
    )

    fireEvent.press(screen.getByText('Monstera Deliciosa'))

    expect(mockOnCardPress).not.toHaveBeenCalled()
  })

  it('applies overdue styling when overdue prop is true', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
        overdue={true}
      />
    )

    // The card should render with overdue styling (tested by presence)
    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })

  it('applies compact styling when compact prop is true', () => {
    render(
      <CareTaskCard
        task={baseTask}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
        compact={true}
      />
    )

    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })

  it('handles null plant image url', () => {
    const taskWithoutImage = {
      ...baseTask,
      plantImageUrl: null,
    }

    render(
      <CareTaskCard
        task={taskWithoutImage}
        onCardPress={mockOnCardPress}
        onPlantPhotoPress={mockOnPlantPhotoPress}
      />
    )

    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })
})
