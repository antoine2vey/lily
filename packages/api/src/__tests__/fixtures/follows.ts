export const mockFollowUser1 = {
  id: 'follow-user-1',
  name: 'Alice',
  image: 'https://example.com/alice.png',
  bio: 'Plant lover',
  plantCount: 5,
  publicProfile: true,
  shareGrowthData: true,
  createdAt: new Date('2024-01-01'),
}

export const mockFollowUser2 = {
  id: 'follow-user-2',
  name: 'Bob',
  image: 'https://example.com/bob.png',
  bio: 'Succulent collector',
  plantCount: 12,
  publicProfile: true,
  shareGrowthData: true,
  createdAt: new Date('2024-01-02'),
}

export const mockFollowUser3 = {
  id: 'follow-user-3',
  name: 'Charlie',
  image: null,
  bio: null,
  plantCount: 0,
  publicProfile: true,
  shareGrowthData: false,
  createdAt: new Date('2024-01-03'),
}

export const mockPrivateUser = {
  id: 'private-user-1',
  name: 'Private Pete',
  image: null,
  bio: 'Hidden garden',
  plantCount: 3,
  publicProfile: false,
  shareGrowthData: false,
  createdAt: new Date('2024-01-04'),
}

export const mockFollowUsers = [
  mockFollowUser1,
  mockFollowUser2,
  mockFollowUser3,
  mockPrivateUser,
]

export const mockFollows = [
  {
    followerId: 'user-1',
    followingId: 'follow-user-1',
    createdAt: new Date('2024-02-01'),
  },
  {
    followerId: 'user-1',
    followingId: 'follow-user-2',
    createdAt: new Date('2024-02-02'),
  },
  {
    followerId: 'follow-user-1',
    followingId: 'user-1',
    createdAt: new Date('2024-02-03'),
  },
  {
    followerId: 'follow-user-2',
    followingId: 'follow-user-3',
    createdAt: new Date('2024-02-04'),
  },
]
