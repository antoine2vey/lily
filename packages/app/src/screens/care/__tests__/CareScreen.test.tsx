import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockDateFuture, mockFixedDate, mockNow } from '@/__tests__/utils/dates'

// Mock dependencies
jest.mock('sonner-native', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    dismiss: jest.fn(),
  },
}))

jest.mock('@/hooks/useCareTasks', () => ({
  useCareTasks: jest.fn(),
}))

jest.mock('@/hooks/useCompleteTask', () => ({
  useCompleteTask: jest.fn(),
}))

jest.mock('@/hooks/useDelegatedTasks', () => ({
  useDelegatedTasks: jest.fn().mockReturnValue({ data: undefined }),
}))

jest.mock('@/hooks/useSkipWaitingPreference', () => ({
  useSkipWaitingPreference: jest.fn(),
}))

import { useCareTasks } from '@/hooks/useCareTasks'
import { useCompleteTask } from '@/hooks/useCompleteTask'
import { useSkipWaitingPreference } from '@/hooks/useSkipWaitingPreference'
import { CareScreen } from '../CareScreen'

const mockedUseCareTasks = useCareTasks as jest.Mock
const mockedUseCompleteTask = useCompleteTask as jest.Mock
const mockedUseSkipWaitingPreference = useSkipWaitingPreference as jest.Mock

describe('CareScreen', () => {
  const mockCompleteTask = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseCompleteTask.mockReturnValue({
      mutate: mockCompleteTask,
    })
    // Default: power-user "skip waiting" off, so the undo countdown applies.
    mockedUseSkipWaitingPreference.mockReturnValue({
      skipWaiting: false,
      setSkipWaiting: jest.fn(),
      isLoading: false,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows loading state initially', () => {
    mockedUseCareTasks.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

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
        upcoming: [],
      },
      isLoading: false,
    })

    render(<CareScreen />)

    expect(screen.getByText('All caught up!')).toBeTruthy()
    expect(screen.getByText('No care tasks scheduled for now')).toBeTruthy()
  })

  it('displays Care title', () => {
    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [],
        upcoming: [],
      },
      isLoading: false,
    })

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
            type: 'watering',
            completed: false,
            dueDate: mockFixedDate(2024, 1, 1),
          },
        ],
        today: [],
        upcoming: [],
      },
      isLoading: false,
    })

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
            type: 'fertilization',
            completed: false,
            dueDate: mockNow(),
          },
        ],
        upcoming: [],
      },
      isLoading: false,
    })

    render(<CareScreen />)

    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Fern')).toBeTruthy()
  })

  it('displays upcoming section when there are upcoming tasks', () => {
    const futureDate = mockDateFuture(3, 'days')

    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [],
        upcoming: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Cactus',
            plantImageUrl: null,
            type: 'watering',
            completed: false,
            dueDate: futureDate,
            dueDayOffset: 3,
            localDueDate: '2026-06-06',
          },
        ],
      },
      isLoading: false,
    })

    render(<CareScreen />)

    expect(screen.getByText('Upcoming')).toBeTruthy()
    expect(screen.getByText('Cactus')).toBeTruthy()
  })

  it('shows confirmation modal when completing future task', () => {
    const futureDate = mockDateFuture(3, 'days')

    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [],
        today: [],
        upcoming: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Cactus',
            plantImageUrl: null,
            type: 'watering',
            completed: false,
            dueDate: futureDate,
            dueDayOffset: 3,
            localDueDate: '2026-06-06',
          },
        ],
      },
      isLoading: false,
    })

    render(<CareScreen />)

    // Press the task card to trigger modal
    fireEvent.press(screen.getByText('Cactus'))

    expect(screen.getByText('Complete Early?')).toBeTruthy()
    expect(screen.getByText('Complete Now')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('displays multiple sections simultaneously', () => {
    const futureDate = mockDateFuture(2, 'days')

    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Monstera',
            plantImageUrl: null,
            type: 'watering',
            completed: false,
            dueDate: mockFixedDate(2024, 1, 1),
          },
        ],
        today: [
          {
            id: 'task-2',
            plantId: 'plant-2',
            plantName: 'Fern',
            plantImageUrl: null,
            type: 'fertilization',
            completed: false,
            dueDate: mockNow(),
          },
        ],
        upcoming: [
          {
            id: 'task-3',
            plantId: 'plant-3',
            plantName: 'Cactus',
            plantImageUrl: null,
            type: 'watering',
            completed: false,
            dueDate: futureDate,
            dueDayOffset: 3,
            localDueDate: '2026-06-06',
          },
        ],
      },
      isLoading: false,
    })

    render(<CareScreen />)

    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Upcoming')).toBeTruthy()
    expect(screen.getByText('Monstera')).toBeTruthy()
    expect(screen.getByText('Fern')).toBeTruthy()
    expect(screen.getByText('Cactus')).toBeTruthy()
  })

  it('completes a task immediately when skip waiting is enabled', () => {
    mockedUseSkipWaitingPreference.mockReturnValue({
      skipWaiting: true,
      setSkipWaiting: jest.fn(),
      isLoading: false,
    })
    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Monstera',
            plantImageUrl: null,
            type: 'watering',
            completed: false,
            dueDate: mockFixedDate(2024, 1, 1),
          },
        ],
        today: [],
        upcoming: [],
      },
      isLoading: false,
    })

    render(<CareScreen />)

    // Tapping the card fires completion synchronously — no undo countdown.
    fireEvent.press(screen.getByText('Monstera'))

    expect(mockCompleteTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      plantId: 'plant-1',
      type: 'watering',
    })
  })

  it('defers completion (undo window) when skip waiting is disabled', () => {
    // Pressing an overdue card schedules a 5s undo timeout; fake timers keep it
    // from leaking past the test (the screen only clears it on undo/fire).
    jest.useFakeTimers()
    // Default mock has skipWaiting: false.
    mockedUseCareTasks.mockReturnValue({
      data: {
        overdue: [
          {
            id: 'task-1',
            plantId: 'plant-1',
            plantName: 'Monstera',
            plantImageUrl: null,
            type: 'watering',
            completed: false,
            dueDate: mockFixedDate(2024, 1, 1),
          },
        ],
        today: [],
        upcoming: [],
      },
      isLoading: false,
    })

    render(<CareScreen />)

    fireEvent.press(screen.getByText('Monstera'))

    // Completion is deferred to the timeout, so the API is not called yet.
    expect(mockCompleteTask).not.toHaveBeenCalled()
  })
})
