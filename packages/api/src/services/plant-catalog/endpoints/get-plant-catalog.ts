import { PlantCatalogRepository } from '@lily/api/repositories/plant-catalog.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect, Option, pipe, String as Str } from 'effect'

export const getPlantCatalog = (query?: string) =>
  Effect.gen(function* () {
    const catalogRepo = yield* PlantCatalogRepository
    const userRepo = yield* UserRepository
    const currentUser = yield* CurrentUser

    const user = yield* userRepo.findById(currentUser.id)
    const lang = user?.language ?? 'en'

    return yield* pipe(
      Option.fromNullable(query),
      Option.filter(Str.isNonEmpty),
      Option.match({
        onNone: () => catalogRepo.findAll(lang),
        onSome: (q) => catalogRepo.search(q, lang),
      })
    )
  })
