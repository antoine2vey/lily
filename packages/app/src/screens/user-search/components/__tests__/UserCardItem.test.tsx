import { render, screen } from '@testing-library/react-native'
import { useAuth } from '@/contexts/AuthContext'
import { UserCardItem } from '../UserCardItem'

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const idleMutation = () => ({ mutate: jest.fn(), isPending: false })

jest.mock('@/hooks/useFollowUser', () => ({ useFollowUser: idleMutation }))
jest.mock('@/hooks/useUnfollowUser', () => ({ useUnfollowUser: idleMutation }))

const mockedUseAuth = useAuth as jest.Mock

const SIGNED_IN_ID = 'me-123'

const renderCard = (id: string) =>
  render(
    <UserCardItem
      id={id}
      name="Rose"
      image={null}
      plantCount={2}
      isFollowing={false}
    />
  )

describe('UserCardItem', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      state: {
        _tag: 'Authenticated',
        user: { id: SIGNED_IN_ID },
        accessToken: 'token',
      },
    })
  })

  it('hides the follow button on your own row', () => {
    renderCard(SIGNED_IN_ID)
    expect(screen.getByText('Rose')).toBeTruthy()
    expect(screen.queryByText('Follow')).toBeNull()
  })

  it("shows the follow button on another user's row", () => {
    renderCard('someone-else')
    expect(screen.getByText('Follow')).toBeTruthy()
  })
})
