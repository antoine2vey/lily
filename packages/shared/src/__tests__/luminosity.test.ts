import { describe, expect, it } from 'vitest'
import {
  LUMINOSITY_LEVELS,
  luxToLuminosityLevel,
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
