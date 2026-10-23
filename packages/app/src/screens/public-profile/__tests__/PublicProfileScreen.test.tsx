import { render, screen } from '@testing-library/react-native'
import { useAuth } from '@/contexts/AuthContext'
import { usePublicProfile } from '@/hooks/usePublicProfile'
import { PublicProfileScreen } from '../PublicProfileScreen'

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/hooks/usePublicProfile', () => ({
  usePublicProfile: jest.fn(),
}))

const idleMutation = () => ({ mutate: jest.fn(), isPending: false })

jest.mock('@/hooks/useFollowUser', () => ({ useFollowUser: idleMutation }))
jest.mock('@/hooks/useUnfollowUser', () => ({ useUnfollowUser: idleMutation }))
jest.mock('@/hooks/useSendNudge', () => ({ useSendNudge: idleMutation }))

const mockedUseAuth = useAuth as jest.Mock
const mockedUsePublicProfile = usePublicProfile as jest.Mock

const SIGNED_IN_ID = 'me-123'

const profileOf = (id: string) => ({
  id,
  name: 'Rose',
  image: null,
  bio: null,
  plantCount: 3,
  followerCount: 1,
  followingCount: 2,
  isFollowing: false,
  shareGrowthData: false,
  createdAt: new Date('2026-05-12T00:00:00Z'),
  recentPlants: [],
})

describe('PublicProfileScreen', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      state: {
        _tag: 'Authenticated',
        user: { id: SIGNED_IN_ID },
        accessToken: 'token',
      },
    })
  })

  const renderProfile = (userId: string) => {
    mockedUsePublicProfile.mockReturnValue({
      data: profileOf(userId),
      isLoading: false,
      apiError: undefined,
    })
    return render(<PublicProfileScreen userId={userId} />)
  }

  it('hides the follow button on your own profile', () => {
    renderProfile(SIGNED_IN_ID)
    expect(screen.getByText('Rose')).toBeTruthy()
    expect(screen.queryByText('Follow')).toBeNull()
  })

  it("shows the follow button on another user's profile", () => {
    renderProfile('someone-else')
    expect(screen.getByText('Follow')).toBeTruthy()
  })

  it('formats the member-since month in the active locale', () => {
    const i18next = jest.requireMock('react-i18next')
    const useTranslation = i18next.useTranslation
    const spy = jest
      .spyOn(i18next, 'useTranslation')
      .mockImplementation((ns: unknown) => {
        const real = useTranslation(ns)
        return { ...real, i18n: { ...real.i18n, language: 'fr' } }
      })
    renderProfile('someone-else')
    expect(screen.getByText('Member since mai 2026')).toBeTruthy()
    spy.mockRestore()
  })
})
