import { render } from '@testing-library/react-native'

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
  it('renders loading state', () => {
    const { toJSON } = render(<EditPlantScreen />)
    expect(toJSON()).toBeTruthy()
  })
})
