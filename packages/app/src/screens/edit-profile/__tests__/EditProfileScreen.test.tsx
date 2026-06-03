import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { mockUsers } from '@/__tests__/fixtures/users'

// Mock dependencies
jest.mock('@/hooks/useUser', () => ({
  useUser: jest.fn(),
}))

jest.mock('@/hooks/useUpdateProfile', () => ({
  useUpdateProfile: jest.fn(),
}))

import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useUser } from '@/hooks/useUser'
import { EditProfileScreen } from '../EditProfileScreen'

const mockedUseUser = useUser as jest.Mock
const mockedUseUpdateProfile = useUpdateProfile as jest.Mock

describe('EditProfileScreen', () => {
  const mockUpdateProfile = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseUpdateProfile.mockReturnValue({
      mutate: mockUpdateProfile,
      isPending: false,
    })
  })

  it('shows skeleton after delay when user data is loading', () => {
    jest.useFakeTimers()
    mockedUseUser.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<EditProfileScreen />)

    // useDelayedLoading defers the skeleton by 300ms to avoid flashing.
    expect(screen.queryByTestId('edit-profile-skeleton')).toBeNull()

    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(screen.getByTestId('edit-profile-skeleton')).toBeTruthy()
    jest.useRealTimers()
  })

  it('displays edit profile title', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<EditProfileScreen />)

    expect(screen.getByText('Edit Profile')).toBeTruthy()
  })

  it('displays cancel and save buttons', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<EditProfileScreen />)

    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('displays name input field', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<EditProfileScreen />)

    expect(screen.getByText('Display Name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter your name')).toBeTruthy()
  })

  it('allows editing name field', () => {
    mockedUseUser.mockReturnValue({
      data: { ...mockUsers[0], name: '' },
      isLoading: false,
    })

    render(<EditProfileScreen />)

    const nameInput = screen.getByPlaceholderText('Enter your name')
    fireEvent.changeText(nameInput, 'New Name')

    expect(nameInput.props.value).toBe('New Name')
  })

  it('calls updateProfile when save is pressed', () => {
    mockedUseUser.mockReturnValue({
      data: { ...mockUsers[0], firstName: 'Test' },
      isLoading: false,
    })

    render(<EditProfileScreen />)

    fireEvent.press(screen.getByText('Save'))

    expect(mockUpdateProfile).toHaveBeenCalled()
  })

  it('blocks save and shows error when firstName is empty', () => {
    mockedUseUser.mockReturnValue({
      data: { ...mockUsers[0], firstName: null },
      isLoading: false,
    })

    render(<EditProfileScreen />)

    fireEvent.press(screen.getByText('Save'))

    expect(mockUpdateProfile).not.toHaveBeenCalled()
    expect(screen.getByText('First name is required')).toBeTruthy()
  })

  it('shows loading indicator when updating', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    mockedUseUpdateProfile.mockReturnValue({
      mutate: mockUpdateProfile,
      isPending: true,
    })

    render(<EditProfileScreen />)

    // Should show loading indicator instead of Save text
    expect(screen.queryByText('Save')).toBeNull()
  })
})
