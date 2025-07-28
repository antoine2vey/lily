import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'
import { type PlantDeleteRequest, transformPlant } from '../utils'

export const deletePlant = (request: PlantDeleteRequest) =>
  Effect.gen(function* () {
    const db = yield* Database

    const rawPlant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.delete({
          where: { id: request.id },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    if (!rawPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return transformPlant(rawPlant)
  })
