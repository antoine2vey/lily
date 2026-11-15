import { describe, expect, it } from 'vitest'
import { isPetSafe, ratingLevel } from '../domains/plant/rating'

describe('ratingLevel', () => {
  it('splits 0-100 into five levels of 20 points', () => {
    expect([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(ratingLevel)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ])
  })

  it('reads the slider stops back as their level', () => {
    expect([10, 30, 50, 70, 90].map(ratingLevel)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('isPetSafe', () => {
  it('holds up to 50 and not above', () => {
    expect([0, 50, 51, 100].map(isPetSafe)).toEqual([true, true, false, false])
  })
})
