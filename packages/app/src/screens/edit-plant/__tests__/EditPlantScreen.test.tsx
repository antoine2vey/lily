import { act, render, screen } from '@testing-library/react-native'

// Mock the client early to prevent msgpackr import issues
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(() => ({
    data: undefined,
    isLoading: true,
  })),
  useEffectMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

// Mock hooks that use client
jest.mock('@/hooks/useDeletePlant', () => ({
  useDeletePlant: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

jest.mock('@/hooks/usePlant', () => ({
  usePlant: jest.fn(() => ({
    data: undefined,
    isLoading: true,
  })),
}))

jest.mock('@/hooks/useUpdatePlant', () => ({
  useUpdatePlant: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ id: 'plant-1' })),
  router: { back: jest.fn(), push: jest.fn() },
}))

import { EditPlantScreen } from '../EditPlantScreen'

describe('EditPlantScreen', () => {
  it('shows skeleton after delay when plant data is loading', () => {
    jest.useFakeTimers()

    render(<EditPlantScreen />)

    // useDelayedLoading defers the skeleton by 300ms to avoid flashing; during
    // that window the initial-load branch renders null (the documented gap).
    expect(screen.queryByTestId('edit-plant-skeleton')).toBeNull()

    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(screen.getByTestId('edit-plant-skeleton')).toBeTruthy()
    jest.useRealTimers()
  })
})
