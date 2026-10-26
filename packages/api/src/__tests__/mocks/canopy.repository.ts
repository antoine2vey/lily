import {
  type CanopyMembership,
  CanopyRepository,
  type ICanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockCanopyMember extends CanopyMembership {
  readonly userId: string
}

export const createMockCanopyRepository = (
  members: ReadonlyArray<MockCanopyMember> = []
): Layer.Layer<CanopyRepository> => {
  const repo: ICanopyRepository = {
    findMembershipByUser: (userId) =>
      Effect.succeed(
        pipe(
          Array.findFirst(members, (m) => m.userId === userId),
          Option.map(({ userId: _, ...membership }) => membership),
          Option.getOrNull
        )
      ),
  }

  return Layer.succeed(CanopyRepository, repo)
}
