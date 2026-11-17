import { Array, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { luxToSliderValue } from '../domains/common/luminosity'
import { ratingLevel } from '../domains/plant/rating'
import { CATALOG } from '../domains/plant-catalog/catalog'

describe('CATALOG', () => {
  it('gives every entry a lux in the luminosity level of its lighting rating', () => {
    const contradictions = Array.filter(CATALOG, (entry) =>
      pipe(
        Option.fromNullishOr(entry.luxNeeded),
        Option.exists(
          (lux) =>
            ratingLevel(luxToSliderValue(lux)) !==
            ratingLevel(entry.lightingRating)
        )
      )
    )

    expect(
      Array.map(contradictions, (entry) => ({
        scientificName: entry.scientificName,
        lightingRating: entry.lightingRating,
        luxNeeded: entry.luxNeeded,
      }))
    ).toEqual([])
  })
})
