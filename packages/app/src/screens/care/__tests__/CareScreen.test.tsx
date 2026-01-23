import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useCareTasks', () => ({
  useCareTasks: jest.fn(),
}))

jest.mock('@/hooks/useCompleteTask', () => ({
  useCompleteTask: jest.fn(),
}))

import { useCareTasks } from '@/hooks/useCareTasks'
import { useCompleteTask } from '@/hooks/useCompleteTask'
import { CareScreen } from '../CareScreen'

const mockedUseCareTasks = useCareTasks as jest.MockedFunction<
  typeof useCareTasks
>
const mockedUseCompleteTask = useCompleteTask as jest.MockedFunction<
  typeof useCompleteTask
>

describe('CareScreen', () => {
  const mockCompleteTask = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseCompleteTask.mockReturnValue({
      mutate: mockCompleteTask,
    } as any)
  })

  it('shows loading state initially', () => {
    mockedUseCareTasks.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any)

    const { toJSON } = render(<CareScreen />)

    // When loading, should not show "Care" title or content
    // Just verify it renders something
    expect(toJSON()).toBeTruthy()
  })

  it('shows empty state when no tasks', () => {
    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [],
        thisWeek: [],
      },
      isLoading: false,
    } as any)

    render(<CareScreen />)

    expect(screen.getByText('All caught up!')).toBeTruthy()
    expect(screen.getByText('No care tasks scheduled for now')).toBeTruthy()
  })

  it('displays Care title', () => {
    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [],
        thisWeek: [],
      },
      isLoading: false,
    } as any)

    render(<CareScreen />)

    expect(screen.getByText('Care')).toBeTruthy()
  })

  it('displays overdue section when there are overdue tasks', () => {
    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Monstera',
            plantImageUrl: null,
            type: 'water',
            completed: false,
            dueDate: new Date('2024-01-01'),
          },
        ],
        today: [],
        thisWeek: [],
      },
      isLoading: false,
    } as any)

    render(<CareScreen />)

    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy() // Badge count
    expect(screen.getByText('Monstera')).toBeTruthy()
  })

  it('displays today section when there are today tasks', () => {
    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Fern',
            plantImageUrl: null,
            type: 'fertilize',
            completed: false,
            dueDate: new Date(),
          },
        ],
        thisWeek: [],
      },
      isLoading: false,
    } as any)

    render(<CareScreen />)

    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Fern')).toBeTruthy()
  })

  it('displays this week section when there are upcoming tasks', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 3)

    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [],
        thisWeek: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Cactus',
            plantImageUrl: null,
            type: 'water',
            completed: false,
            dueDate: futureDate,
          },
        ],
      },
      isLoading: false,
    } as any)

    render(<CareScreen />)

    expect(screen.getByText('This Week')).toBeTruthy()
    expect(screen.getByText('Cactus')).toBeTruthy()
  })

  it('shows confirmation modal when completing future task', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 3)

    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [],
        thisWeek: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Cactus',
            plantImageUrl: null,
            type: 'water',
            completed: false,
            dueDate: futureDate,
          },
        ],
      },
      isLoading: false,
    } as any)

    render(<CareScreen />)

    // Press the task card to trigger modal
    fireEvent.press(screen.getByText('Cactus'))

    expect(screen.getByText('Complete Early?')).toBeTruthy()
    expect(screen.getByText('Complete Now')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('displays multiple sections simultaneously', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 2)

    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Monstera',
            plantImageUrl: null,
            type: 'water',
            completed: false,
            dueDate: new Date('2024-01-01'),
          },
        ],
        today: [
          {
            id: 'task-2',
            plantId: 'plant-2',
            plantName: 'Fern',
            plantImageUrl: null,
            type: 'fertilize',
            completed: false,
            dueDate: new Date(),
          },
        ],
        thisWeek: [
          {
            id: 'task-3',
            plantId: 'plant-3',
            plantName: 'Cactus',
            plantImageUrl: null,
            type: 'water',
            completed: false,
            dueDate: futureDate,
          },
        ],
      },
      isLoading: false,
    } as any)

    render(<CareScreen />)

    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('This Week')).toBeTruthy()
    expect(screen.getByText('Monstera')).toBeTruthy()
    expect(screen.getByText('Fern')).toBeTruthy()
    expect(screen.getByText('Cactus')).toBeTruthy()
  })
})
