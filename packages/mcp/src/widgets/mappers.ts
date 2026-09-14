import {
  healthColor,
  healthLabel,
  MEMORIAL_COLOR,
  MEMORIAL_LABEL,
} from '@lily/mcp/widgets/health'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import { formatIsoDate } from '@lily/shared'
import { Option, pipe } from 'effect'

/**
 * Converts a plant (with optional room) into a PlantSummary
 * for widget structured data.
 */
export const toPlantSummary = (plant: {
  readonly id: string
  readonly name: string
  readonly health: string
  readonly diedAt?: Date | string | null
  readonly room?: { readonly name: string; readonly icon: string } | null
  readonly ownership?: string | null
  readonly ownerName?: string | null
}): PlantSummary => {
  const roomOpt = Option.fromNullable(plant.room)
  const diedAtOpt = Option.fromNullable(plant.diedAt)
  const isDead = Option.isSome(diedAtOpt)

  return {
    id: plant.id,
    name: plant.name,
    healthLabel: isDead ? MEMORIAL_LABEL : healthLabel(plant.health),
    healthColor: isDead ? MEMORIAL_COLOR : healthColor(plant.health),
    isDead,
    diedAt: Option.getOrNull(Option.map(diedAtOpt, (d) => formatIsoDate(d))),
    roomName: Option.getOrNull(Option.map(roomOpt, (r) => r.name)),
    roomIcon: Option.getOrNull(Option.map(roomOpt, (r) => r.icon)),
    ownership: pipe(
      Option.fromNullable(plant.ownership),
      Option.getOrElse(() => 'owned')
    ),
    ownerName: Option.getOrNull(Option.fromNullable(plant.ownerName)),
  }
}
