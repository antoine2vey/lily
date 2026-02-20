import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  isRoomCompatibleWithPlant,
  LUMINOSITY_LEVELS,
  luxToLuminosityLevel,
  luxToSliderValue,
} from '../domains/common/luminosity'

describe('luxToLuminosityLevel', () => {
  it('should return 1 for lux below 250', () => {
    expect(luxToLuminosityLevel(0)).toBe(1)
    expect(luxToLuminosityLevel(100)).toBe(1)
    expect(luxToLuminosityLevel(249)).toBe(1)
  })

  it('should return 2 for lux between 250 and 999', () => {
    expect(luxToLuminosityLevel(250)).toBe(2)
    expect(luxToLuminosityLevel(500)).toBe(2)
    expect(luxToLuminosityLevel(999)).toBe(2)
  })

  it('should return 3 for lux between 1000 and 4999', () => {
    expect(luxToLuminosityLevel(1000)).toBe(3)
    expect(luxToLuminosityLevel(2500)).toBe(3)
    expect(luxToLuminosityLevel(4999)).toBe(3)
  })

  it('should return 4 for lux between 5000 and 24999', () => {
    expect(luxToLuminosityLevel(5000)).toBe(4)
    expect(luxToLuminosityLevel(15000)).toBe(4)
    expect(luxToLuminosityLevel(24999)).toBe(4)
  })

  it('should return 5 for lux 25000 and above', () => {
    expect(luxToLuminosityLevel(25000)).toBe(5)
    expect(luxToLuminosityLevel(50000)).toBe(5)
    expect(luxToLuminosityLevel(100000)).toBe(5)
  })
})

describe('isRoomCompatibleWithPlant', () => {
  it('should return None when room has no luminosity', () => {
    expect(Option.isNone(isRoomCompatibleWithPlant(null, 500))).toBe(true)
  })

  it('should return Some(true) when room and plant are same level', () => {
    // Room: 500 lux (level 2), Plant: 500 lux (level 2)
    expect(isRoomCompatibleWithPlant(500, 500)).toEqual(Option.some(true))
    // Room: 40000 lux (level 5), Plant: 40000 lux (level 5)
    expect(isRoomCompatibleWithPlant(40000, 40000)).toEqual(Option.some(true))
  })

  it('should return Some(false) when room level differs from plant level', () => {
    // Room: 100 lux (level 1), Plant: 10000 lux (level 4) — too little light
    expect(isRoomCompatibleWithPlant(100, 10000)).toEqual(Option.some(false))
    // Room: 40000 lux (level 5), Plant: 10000 lux (level 4) — too much light
    expect(isRoomCompatibleWithPlant(40000, 10000)).toEqual(Option.some(false))
  })
})

describe('luxToSliderValue', () => {
  it('should return 10 for low light lux values', () => {
    expect(luxToSliderValue(0)).toBe(10)
    expect(luxToSliderValue(100)).toBe(10)
    expect(luxToSliderValue(249)).toBe(10)
  })

  it('should return 30 for medium light lux values', () => {
    expect(luxToSliderValue(250)).toBe(30)
    expect(luxToSliderValue(500)).toBe(30)
    expect(luxToSliderValue(999)).toBe(30)
  })

  it('should return 50 for bright indirect lux values', () => {
    expect(luxToSliderValue(1000)).toBe(50)
    expect(luxToSliderValue(2000)).toBe(50)
    expect(luxToSliderValue(4999)).toBe(50)
  })

  it('should return 70 for direct light lux values', () => {
    expect(luxToSliderValue(5000)).toBe(70)
    expect(luxToSliderValue(10000)).toBe(70)
    expect(luxToSliderValue(24999)).toBe(70)
  })

  it('should return 90 for full sun lux values', () => {
    expect(luxToSliderValue(25000)).toBe(90)
    expect(luxToSliderValue(40000)).toBe(90)
    expect(luxToSliderValue(100000)).toBe(90)
  })
})

describe('LUMINOSITY_LEVELS', () => {
  it('should have labels for all 5 levels', () => {
    expect(LUMINOSITY_LEVELS[1].label).toBe('Low light')
    expect(LUMINOSITY_LEVELS[2].label).toBe('Medium light')
    expect(LUMINOSITY_LEVELS[3].label).toBe('Bright indirect')
    expect(LUMINOSITY_LEVELS[4].label).toBe('Direct light')
    expect(LUMINOSITY_LEVELS[5].label).toBe('Full sun')
  })

  it('should have icons for all 5 levels', () => {
    expect(LUMINOSITY_LEVELS[1].icon).toBeDefined()
    expect(LUMINOSITY_LEVELS[2].icon).toBeDefined()
    expect(LUMINOSITY_LEVELS[3].icon).toBeDefined()
    expect(LUMINOSITY_LEVELS[4].icon).toBeDefined()
    expect(LUMINOSITY_LEVELS[5].icon).toBeDefined()
  })
})
