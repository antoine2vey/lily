import { healthColor, healthLabel } from '@lily/mcp/widgets/health'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import { Option, pipe } from 'effect'

/**
 * Converts a plant (with optional room) into a PlantSummary
 * for widget structured data.
 */
export const toPlantSummary = (plant: {
  readonly id: string
  readonly name: string
  readonly health: string
  readonly room?: { readonly name: string; readonly icon: string } | null
  readonly ownership?: string | null
  readonly ownerName?: string | null
}): PlantSummary => {
  const roomOpt = Option.fromNullable(plant.room)

  return {
    id: plant.id,
    name: plant.name,
    healthLabel: healthLabel(plant.health),
    healthColor: healthColor(plant.health),
    roomName: Option.getOrNull(Option.map(roomOpt, (r) => r.name)),
    roomIcon: Option.getOrNull(Option.map(roomOpt, (r) => r.icon)),
    ownership: pipe(
      Option.fromNullable(plant.ownership),
      Option.getOrElse(() => 'owned')
    ),
    ownerName: Option.getOrNull(Option.fromNullable(plant.ownerName)),
  }
}
