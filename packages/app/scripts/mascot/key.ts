// Masko's alpha mask covers only the mascot: rain, confetti and other
// particles are drawn onto its transparency checkerboard but left out of the
// mask, so the app cut them off. This recovers them by difference keying:
// whatever departs from the checkerboard joins the mask.
//
// The frames are stacked rgb24 (color half on top, mask half below), keyed in
// place. Hot loops over typed arrays: hundreds of MB per clip.

// Max-channel distance from the checkerboard below KEY_FLOOR is codec noise.
const KEY_FLOOR = 12
// The distance at which a particle turns fully opaque. Solid particles
// saturate early: a pale one (the beige envelope) sits closer to the gray
// tiles than to the white ones, and a slow ramp would print the checkerboard
// into its alpha. Rain cores land near 90, so drops keep their translucency.
export const SOLID_PARTICLES = 50
export const TRANSLUCENT_PARTICLES = 90
// A pixel counts as checkerboard in a frame when the mask is below MASK_CLEAR,
// and needs MIN_SAMPLES such frames for its median to be trusted.
const MASK_CLEAR = 8
const MIN_SAMPLES = 8
const MAX_PERIOD = 128

// Every index is in range by construction; the fallback only satisfies
// noUncheckedIndexedAccess.
const byte = (bytes: Uint8Array, i: number): number => bytes[i] ?? 0

export const keyCheckerboard = (
  frames: Uint8Array,
  size: number,
  keyFull: number
): void => {
  const pixels = size * size
  const frameBytes = pixels * 2 * 3
  const frameCount = frames.length / frameBytes
  const mask = (f: number, p: number) =>
    byte(frames, f * frameBytes + (pixels + p) * 3)

  // Per-channel median over the frames where the mascot leaves the pixel
  // uncovered. Particles pass through, so the median is the checkerboard.
  const plate = new Uint8Array(pixels * 3)
  const known = new Uint8Array(pixels)
  const samples = new Uint8Array(frameCount)
  for (let p = 0; p < pixels; p++) {
    for (let c = 0; c < 3; c++) {
      let n = 0
      for (let f = 0; f < frameCount; f++)
        if (mask(f, p) < MASK_CLEAR)
          samples[n++] = byte(frames, f * frameBytes + p * 3 + c)
      if (n < MIN_SAMPLES) break
      plate[p * 3 + c] = byte(samples.subarray(0, n).sort(), n >> 1)
      known[p] = 1
    }
  }

  fillCovered(plate, known, size, checkerPeriod(plate, known, size))

  for (let f = 0; f < frameCount; f++) {
    const color = f * frameBytes
    const alpha = color + pixels * 3
    for (let p = 0; p < pixels; p++) {
      const o = color + p * 3
      let distance = 0
      for (let c = 0; c < 3; c++)
        distance = Math.max(
          distance,
          Math.abs(byte(frames, o + c) - byte(plate, p * 3 + c))
        )
      const key = Math.min(
        1,
        Math.max(0, (distance - KEY_FLOOR) / (keyFull - KEY_FLOOR))
      )
      const masked = byte(frames, alpha + p * 3) / 255
      if (key <= masked) continue

      // The source is the particle composited over the checkerboard;
      // un-composite it so the particle keeps its own color at this alpha.
      for (let c = 0; c < 3; c++) {
        const bg = byte(plate, p * 3 + c)
        frames[o + c] = Math.min(
          255,
          Math.max(0, Math.round(bg + (byte(frames, o + c) - bg) / key))
        )
      }
      const value = Math.round(key * 255)
      frames[alpha + p * 3] = value
      frames[alpha + p * 3 + 1] = value
      frames[alpha + p * 3 + 2] = value
    }
  }
}

// The checkerboard repeats with an integer period (two tiles, or a multiple
// when scaling made the tile size fractional): the shift that best matches
// the plate against itself.
const checkerPeriod = (
  plate: Uint8Array,
  known: Uint8Array,
  size: number
): number => {
  let period = 0
  let best = Number.POSITIVE_INFINITY
  for (let shift = 4; shift <= MAX_PERIOD; shift++) {
    let sum = 0
    let n = 0
    for (let y = 0; y < size; y += 3)
      for (let x = 0; x + shift < size; x++) {
        const p = y * size + x
        if (!known[p] || !known[p + shift]) continue
        sum += Math.abs(byte(plate, p * 3) - byte(plate, (p + shift) * 3))
        n++
      }
    if (n > 0 && sum / n < best - 0.05) {
      best = sum / n
      period = shift
    }
  }
  return period
}

// Pixels the mascot covers in nearly every frame have no median. Copy them
// from a known pixel one period away, spreading inward until all are filled.
// Masko's mask has holes wherever confetti crosses the mascot, and these
// pixels need a plate for the key to fill those holes back in.
const fillCovered = (
  plate: Uint8Array,
  known: Uint8Array,
  size: number,
  period: number
): void => {
  if (period === 0) return
  const pixels = size * size
  for (let filled = 1; filled > 0; ) {
    filled = 0
    for (let p = 0; p < pixels; p++) {
      if (known[p]) continue
      const x = p % size
      const y = (p - x) / size
      const row = period * size
      let source = -1
      if (x >= period && known[p - period] === 1) source = p - period
      else if (x + period < size && known[p + period] === 1) source = p + period
      else if (y >= period && known[p - row] === 1) source = p - row
      else if (y + period < size && known[p + row] === 1) source = p + row
      if (source < 0) continue
      plate.copyWithin(p * 3, source * 3, source * 3 + 3)
      known[p] = 2
      filled++
    }
    for (let p = 0; p < pixels; p++) if (known[p] === 2) known[p] = 1
  }
}
