import {
  type IRareIdentificationRepository,
  type RareIdentification,
  RareIdentificationRepository,
} from '@lily/api/repositories/rare-identification.repository'
import { Array, Effect, Layer } from 'effect'

export const createMockRareIdentificationRepository = (
  identifications: RareIdentification[] = []
): Layer.Layer<RareIdentificationRepository> => {
  const matches =
    (identification: RareIdentification) => (row: RareIdentification) =>
      row.userId === identification.userId &&
      row.imageUrl === identification.imageUrl

  const repo: IRareIdentificationRepository = {
    record: (identification) =>
      Effect.sync(() => {
        if (!Array.some(identifications, matches(identification))) {
          identifications.push(identification)
        }
      }),
    exists: (identification) =>
      Effect.succeed(Array.some(identifications, matches(identification))),
  }

  return Layer.succeed(RareIdentificationRepository, repo)
}
