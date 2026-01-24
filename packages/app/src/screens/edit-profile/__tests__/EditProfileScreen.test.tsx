import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { fireEvent, render, screen } from '@testing-library/react-native'

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

const mockedUseUser = useUser as jest.MockedFunction<typeof useUser>
const mockedUseUpdateProfile = useUpdateProfile as jest.MockedFunction<
  typeof useUpdateProfile
>

describe('EditProfileScreen', () => {
  const mockUpdateProfile = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseUpdateProfile.mockReturnValue({
      mutate: mockUpdateProfile,
      isPending: false,
    })
  })

  it('shows loading state when user data is loading', () => {
    mockedUseUser.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<EditProfileScreen />)

    expect(screen.getByTestId('activity-indicator')).toBeTruthy()
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
    expect(screen.getByPlaceholderText('Your name')).toBeTruthy()
  })

  it('displays username input field', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<EditProfileScreen />)

    expect(screen.getByText('Username')).toBeTruthy()
    expect(screen.getByText('@')).toBeTruthy()
  })

  it('displays private profile toggle', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<EditProfileScreen />)

    expect(screen.getByText('Private Profile')).toBeTruthy()
    expect(screen.getByText(/Only people you approve can see/)).toBeTruthy()
  })

  it('allows editing name field', () => {
    mockedUseUser.mockReturnValue({
      data: { ...mockUsers[0], name: '' },
      isLoading: false,
    })

    render(<EditProfileScreen />)

    const nameInput = screen.getByPlaceholderText('Your name')
    fireEvent.changeText(nameInput, 'New Name')

    expect(nameInput.props.value).toBe('New Name')
  })

  it('calls updateProfile when save is pressed', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<EditProfileScreen />)

    fireEvent.press(screen.getByText('Save'))

    expect(mockUpdateProfile).toHaveBeenCalled()
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
