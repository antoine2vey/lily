import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { mockPlants } from '@/__tests__/fixtures/plants'
import { usePlant } from '@/hooks/usePlant'
import { useUpdatePlant } from '@/hooks/useUpdatePlant'

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

jest.mock('@/hooks/useMarkPlantDead', () => ({
  useMarkPlantDead: jest.fn(() => ({
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
  useLocalSearchParams: jest.fn(() => ({ plantId: 'plant-1' })),
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

  it('saves the reminders switch the user turned back on', () => {
    const muted = mockPlants.find((plant) => !plant.remindersEnabled)!
    const mutate = jest.fn()
    ;(usePlant as jest.Mock).mockReturnValue({
      data: { ...muted, photos: [] },
      isLoading: false,
    })
    ;(useUpdatePlant as jest.Mock).mockReturnValue({ mutate, isPending: false })

    render(<EditPlantScreen />)

    const reminders = screen.getByTestId('edit-reminders-switch')
    expect(reminders.props.value).toBe(false)

    fireEvent(reminders, 'valueChange', true)
    fireEvent.press(screen.getByTestId('edit-plant-save'))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ remindersEnabled: true }),
      }),
      expect.anything()
    )
  })
})
