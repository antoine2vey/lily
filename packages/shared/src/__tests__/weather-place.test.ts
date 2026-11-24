import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { weatherPlaceOf } from '../domains/common/geo'

describe('weatherPlaceOf', () => {
  it('keeps a coordinate of exactly zero', () => {
    expect(weatherPlaceOf({ latitude: 0, longitude: 9.45 })).toEqual(
      Option.some({ latitude: 0, longitude: 9.45 })
    )
    expect(weatherPlaceOf({ latitude: 51.48, longitude: 0 })).toEqual(
      Option.some({ latitude: 51.48, longitude: 0 })
    )
    expect(weatherPlaceOf({ latitude: 0, longitude: 0 })).toEqual(
      Option.some({ latitude: 0, longitude: 0 })
    )
  })

  it('has no place when either coordinate is missing', () => {
    expect(weatherPlaceOf({ latitude: null, longitude: 2.35 })).toEqual(
      Option.none()
    )
    expect(weatherPlaceOf({ latitude: 48.85, longitude: null })).toEqual(
      Option.none()
    )
  })
})
