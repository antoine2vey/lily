import {
  type CanopyMemberRow,
  CanopyRepository,
  type CanopyRow,
} from '@lily/api/repositories/canopy.repository'
import {
  type Canopy,
  type CanopyId,
  type CanopyMemberRole,
  CanopyNotFoundError,
} from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const toCanopy = (
  canopy: CanopyRow,
  members: ReadonlyArray<CanopyMemberRow>,
  role: CanopyMemberRole,
  invite: { readonly expiresAt: Date } | null
): Canopy => ({
  id: canopy.id as CanopyId,
  name: canopy.name,
  timezone: canopy.timezone,
  latitude: canopy.latitude,
  longitude: canopy.longitude,
  role,
  members: Array.map(members, ({ userId, name, image, role, joinedAt }) => ({
    userId,
    name,
    image,
    role,
    joinedAt,
  })),
  invite,
  createdAt: canopy.createdAt,
  updatedAt: canopy.updatedAt,
})

/** The Canopy as `viewerId` sees it; not found unless they are a member. */
export const canopyView = (
  canopyId: string,
  viewerId: string
): Effect.Effect<Canopy, CanopyNotFoundError | SqlError, CanopyRepository> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const canopy = yield* repo.findById(canopyId)
    if (canopy === null) {
      return yield* new CanopyNotFoundError()
    }
    const members = yield* repo.findMembers(canopyId)
    const viewer = yield* pipe(
      Array.findFirst(members, (m) => m.userId === viewerId),
      Option.match({
        onNone: () => Effect.fail(new CanopyNotFoundError()),
        onSome: Effect.succeed,
      })
    )
    const invite = yield* repo.findActiveInvite(canopyId)
    return toCanopy(canopy, members, viewer.role, invite)
  })
