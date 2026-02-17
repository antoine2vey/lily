/**
 * Care Adjustment Algorithm -- Evapotranspiration-based plant care scheduling
 *
 * This module re-exports the public API from the algorithm sub-modules.
 *
 * The core concept is Evapotranspiration (ET): the combined process of water
 * evaporating from the soil surface and transpiring through plant stomata
 * (tiny pores on leaves that open to exchange gases for photosynthesis).
 *
 * Primary reference: FAO Irrigation and Drainage Paper No. 56 (FAO-56)
 *   "Crop evapotranspiration - Guidelines for computing crop water requirements"
 *   Allen, R.G., Pereira, L.S., Raes, D. and Smith, M. (1998)
 *   https://www.fao.org/4/x0490e/x0490e00.htm
 *
 * Additional sources:
 *   - MSU Extension: "What is evapotranspiration and why it matters"
 *   - Colorado State Extension: "Irrigation scheduling: the water balance approach"
 *   - NC Climate Office: "Four weather factors for plant growth"
 */

export type {
  PlantForAdjustment,
  PlantForScheduleDelta,
  ScheduleDelta,
} from '@lily/api/services/weather/algorithm/adjustment'

export {
  calculatePlantAdjustment,
  calculateScheduleDelta,
} from '@lily/api/services/weather/algorithm/adjustment'
