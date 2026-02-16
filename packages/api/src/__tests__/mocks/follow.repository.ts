import {
  FollowRepository,
  type IFollowRepository,
  type PublicPlantPreviewRow,
  type PublicProfileRow,
  type UserCardRow,
} from '@lily/api/repositories/follow.repository'
import { Array, Effect, Layer, Option, pipe } from 'effect'

interface FollowRecord {
  followerId: string
  followingId: string
  createdAt: Date
}

interface NudgeRecord {
  fromUserId: string
  toUserId: string
  createdAt: Date
}

interface MockUser {
  id: string
  name: string | null
  image: string | null
  bio: string | null
  plantCount: number
  publicProfile: boolean
  shareGrowthData: boolean
  createdAt: Date
  plants?: ReadonlyArray<PublicPlantPreviewRow>
}

interface MockFollowRepositoryData {
  follows?: FollowRecord[]
  nudges?: NudgeRecord[]
  users?: MockUser[]
}

export const createMockFollowRepository = (
  data: MockFollowRepositoryData = {}
): Layer.Layer<FollowRepository> => {
  const follows: FollowRecord[] = data.follows ?? []
  const nudges: NudgeRecord[] = data.nudges ?? []
  const mockUsers: MockUser[] = data.users ?? []

  const isFollowing = (followerId: string, followingId: string) =>
    Array.some(
      follows,
      (f) => f.followerId === followerId && f.followingId === followingId
    )

  const toUserCard = (user: MockUser, currentUserId: string): UserCardRow => ({
    id: user.id,
    name: user.name,
    image: user.image,
    plantCount: user.plantCount,
    isFollowing: isFollowing(currentUserId, user.id),
  })

  const repo: IFollowRepository = {
    follow: (followerId, followingId) =>
      Effect.sync(() => {
        follows.push({
          followerId,
          followingId,
          createdAt: new Date(),
        })
      }),

    unfollow: (followerId, followingId) =>
      Effect.sync(() => {
        const idx = follows.findIndex(
          (f) => f.followerId === followerId && f.followingId === followingId
        )
        if (idx !== -1) follows.splice(idx, 1)
      }),

    isFollowing: (followerId, followingId) =>
      Effect.succeed(isFollowing(followerId, followingId)),

    getFollowers: (params) =>
      Effect.succeed(
        pipe(
          follows,
          Array.filter((f) => f.followingId === params.userId),
          (allFollows) => {
            const items = pipe(
              allFollows,
              Array.filterMap((f) =>
                pipe(
                  Array.findFirst(
                    mockUsers,
                    (u) => u.id === f.followerId && u.publicProfile
                  ),
                  Option.map((u) => toUserCard(u, params.currentUserId))
                )
              )
            )
            return {
              items,
              total: allFollows.length,
            }
          }
        )
      ),

    getFollowing: (params) =>
      Effect.succeed(
        pipe(
          follows,
          Array.filter((f) => f.followerId === params.userId),
          Array.filterMap((f) =>
            pipe(
              Array.findFirst(mockUsers, (u) => u.id === f.followingId),
              Option.map((u) => toUserCard(u, params.currentUserId))
            )
          ),
          (items) => ({
            items,
            total: items.length,
          })
        )
      ),

    getFollowerCount: (userId) =>
      Effect.succeed(
        Array.filter(follows, (f) => f.followingId === userId).length
      ),

    getFollowingCount: (userId) =>
      Effect.succeed(
        Array.filter(follows, (f) => f.followerId === userId).length
      ),

    getFollowingStatuses: (currentUserId, userIds) =>
      Effect.succeed(
        new Set(
          pipe(
            follows,
            Array.filter(
              (f) =>
                f.followerId === currentUserId &&
                Array.contains(userIds, f.followingId)
            ),
            Array.map((f) => f.followingId)
          )
        )
      ),

    searchUsers: (params) =>
      Effect.succeed(
        pipe(
          mockUsers,
          Array.filter(
            (u) =>
              u.publicProfile &&
              u.id !== params.currentUserId &&
              u.name !== null &&
              u.name.toLowerCase().includes(params.query.toLowerCase())
          ),
          Array.map((u) => toUserCard(u, params.currentUserId)),
          (items) => ({
            items,
            total: items.length,
          })
        )
      ),

    getSuggestedUsers: (params) =>
      Effect.succeed(
        pipe(
          follows,
          Array.filter((f) => f.followerId === params.currentUserId),
          Array.flatMap((f) =>
            Array.filter(follows, (f2) => f2.followerId === f.followingId)
          ),
          Array.filterMap((f) =>
            pipe(
              Array.findFirst(
                mockUsers,
                (u) =>
                  u.id === f.followingId &&
                  u.publicProfile &&
                  u.id !== params.currentUserId &&
                  !isFollowing(params.currentUserId, u.id)
              ),
              Option.map((u) => toUserCard(u, params.currentUserId))
            )
          ),
          Array.dedupe
        )
      ),

    getPublicProfile: (params) =>
      Effect.succeed(
        pipe(
          Array.findFirst(mockUsers, (u) => u.id === params.targetUserId),
          Option.map(
            (u): PublicProfileRow => ({
              id: u.id,
              name: u.name,
              image: u.image,
              bio: u.bio,
              plantCount: u.plantCount,
              followerCount: Array.filter(
                follows,
                (f) => f.followingId === u.id
              ).length,
              followingCount: Array.filter(
                follows,
                (f) => f.followerId === u.id
              ).length,
              isFollowing: isFollowing(params.currentUserId, u.id),
              shareGrowthData: u.shareGrowthData,
              publicProfile: u.publicProfile,
              createdAt: u.createdAt,
              recentPlants: u.plants ?? [],
            })
          ),
          Option.getOrNull
        )
      ),

    getLastNudge: (fromUserId, toUserId) =>
      Effect.succeed(
        pipe(
          nudges,
          Array.filter(
            (n) => n.fromUserId === fromUserId && n.toUserId === toUserId
          ),
          Array.last,
          Option.map((n) => n.createdAt),
          Option.getOrNull
        )
      ),

    recordNudge: (fromUserId, toUserId) =>
      Effect.sync(() => {
        nudges.push({
          fromUserId,
          toUserId,
          createdAt: new Date(),
        })
      }),
  }

  return Layer.succeed(FollowRepository, repo)
}
