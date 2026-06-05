import {
  headingToOrientation,
  ORIENTATION_INFO,
  ORIENTATIONS,
  type Orientation,
} from '@lily/shared'
import { describe, expect, it } from 'vitest'

describe('headingToOrientation', () => {
  it('maps each cardinal/intercardinal center to itself', () => {
    expect(headingToOrientation(0)).toBe('N')
    expect(headingToOrientation(45)).toBe('NE')
    expect(headingToOrientation(90)).toBe('E')
    expect(headingToOrientation(135)).toBe('SE')
    expect(headingToOrientation(180)).toBe('S')
    expect(headingToOrientation(225)).toBe('SW')
    expect(headingToOrientation(270)).toBe('W')
    expect(headingToOrientation(315)).toBe('NW')
  })

  it('snaps within a 45° bucket (boundaries land in the upper bucket)', () => {
    expect(headingToOrientation(22.4)).toBe('N')
    expect(headingToOrientation(22.5)).toBe('NE') // boundary → upper bucket
    expect(headingToOrientation(67.4)).toBe('NE') // just below the E boundary
    expect(headingToOrientation(67.5)).toBe('E') // boundary → upper bucket
    expect(headingToOrientation(337.5)).toBe('N') // wraps to N, not NW
  })

  it('wraps North across 360° and handles ≥360', () => {
    expect(headingToOrientation(359)).toBe('N')
    expect(headingToOrientation(360)).toBe('N')
    expect(headingToOrientation(720)).toBe('N')
  })

  it('normalizes negative headings', () => {
    expect(headingToOrientation(-45)).toBe('NW') // 315°
    expect(headingToOrientation(-90)).toBe('W') // 270°
    expect(headingToOrientation(-1)).toBe('N') // 359°
  })

  it('is the inverse of each direction’s center bearing', () => {
    for (const o of ORIENTATIONS) {
      expect(headingToOrientation(ORIENTATION_INFO[o].degrees)).toBe(o)
    }
  })

  it('always returns one of the 8 valid orientations across a full sweep', () => {
    const valid = new Set<Orientation>(ORIENTATIONS)
    for (let deg = -720; deg <= 720; deg += 3) {
      expect(valid.has(headingToOrientation(deg))).toBe(true)
    }
  })
})
