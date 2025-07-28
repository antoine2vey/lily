import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { PlantUpdateRequest } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect, pipe, Record } from 'effect'
import { transformPlant } from '../utils'

export const updatePlant = (request: PlantUpdateRequest & { id: string }) =>
  Effect.gen(function* () {
    const db = yield* Database
    const data = pipe(
      Object.entries(request),
      Record.fromEntries,
      Record.remove('id'),
      Record.filter((_, value) => value !== undefined)
    )

    const rawPlant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.update({
          where: { id: request.id },
          data,
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    if (!rawPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return transformPlant(rawPlant)
  })
