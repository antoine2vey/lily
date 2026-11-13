import { type Frequency, frequencyOfDays } from '@lily/api/contexts/care'
import type { CareType } from '@lily/shared'
import { Array, Option } from 'effect'

interface FrequencyFields {
  readonly wateringFrequencyDays?: number | undefined
  readonly fertilizationFrequencyDays?: number | null | undefined
  readonly mistingFrequencyDays?: number | null | undefined
  readonly repottingFrequencyDays?: number | null | undefined
}

export const frequencyChanges = (
  request: FrequencyFields
): ReadonlyArray<readonly [CareType, Option.Option<Frequency>]> =>
  Array.flatMap(
    [
      ['watering', request.wateringFrequencyDays],
      ['fertilization', request.fertilizationFrequencyDays],
      ['misting', request.mistingFrequencyDays],
      ['repotting', request.repottingFrequencyDays],
    ] as const,
    ([careType, days]) =>
      days === undefined
        ? []
        : [
            [
              careType,
              Option.map(Option.fromNullOr(days), frequencyOfDays),
            ] as const,
          ]
  )
