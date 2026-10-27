import { Array } from 'effect'

/** One member without a plant limit lifts the Canopy's; otherwise it shares the free cap. */
export const canopyPlantCapFrom = (
  memberCaps: ReadonlyArray<number | null>,
  freeCap: number | null
): number | null =>
  Array.some(memberCaps, (cap) => cap === null) ? null : freeCap
