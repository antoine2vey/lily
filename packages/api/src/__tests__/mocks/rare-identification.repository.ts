import {
  type IRareIdentificationRepository,
  type RareIdentification,
  RareIdentificationRepository,
} from '@lily/api/repositories/rare-identification.repository'
import { Array, Effect, Layer } from 'effect'

export const createMockRareIdentificationRepository = (
  identifications: RareIdentification[] = []
): Layer.Layer<RareIdentificationRepository> => {
  const repo: IRareIdentificationRepository = {
    record: (identification) =>
      Effect.sync(() => {
        identifications.push(identification)
      }),
    exists: (identification) =>
      Effect.succeed(
        Array.some(
          identifications,
          (row) =>
            row.userId === identification.userId &&
            row.imageUrl === identification.imageUrl
        )
      ),
  }

  return Layer.succeed(RareIdentificationRepository, repo)
}
