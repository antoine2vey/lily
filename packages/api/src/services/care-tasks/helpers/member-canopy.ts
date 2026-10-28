import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { Effect, Option, pipe } from 'effect'

export const memberCanopyId = (userId: string) =>
  Effect.flatMap(CanopyRepository, (repo) =>
    Effect.map(repo.findMembershipByUser(userId), (membership) =>
      pipe(
        Option.fromNullishOr(membership),
        Option.map((m): string => m.canopyId),
        Option.getOrNull
      )
    )
  )
