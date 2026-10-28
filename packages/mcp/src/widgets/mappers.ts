import {
  healthColor,
  healthLabel,
  MEMORIAL_COLOR,
  MEMORIAL_LABEL,
} from '@lily/mcp/widgets/health'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import { formatIsoDate } from '@lily/shared'
import type { Plant } from '@lily/shared/plant'
import { Match, Option, pipe } from 'effect'

type PlantOwnershipFields = Pick<Plant, 'ownership' | 'ownerName' | 'canopy'>

export const ownershipLabel = (
  plant: PlantOwnershipFields
): Option.Option<string> =>
  pipe(
    Match.value(plant.ownership),
    Match.when('owned', () => Option.none()),
    Match.when('caretaking', () =>
      Option.some(
        `Caretaking for ${pipe(
          Option.fromNullishOr(plant.ownerName),
          Option.getOrElse(() => 'someone')
        )}`
      )
    ),
    Match.when('canopy', () =>
      Option.map(
        Option.fromNullishOr(plant.canopy),
        (canopy) => `Canopy: ${canopy.name}`
      )
    ),
    Match.exhaustive
  )

export const ownershipSuffix = (plant: PlantOwnershipFields): string =>
  pipe(
    ownershipLabel(plant),
    Option.map((label) => ` | ${label}`),
    Option.getOrElse(() => '')
  )

/**
 * Converts a plant (with optional room) into a PlantSummary
 * for widget structured data.
 */
export const toPlantSummary = (
  plant: PlantOwnershipFields & {
    readonly id: string
    readonly name: string
    readonly health: string
    readonly diedAt?: Date | string | null
    readonly room?: { readonly name: string; readonly icon: string } | null
  }
): PlantSummary => {
  const roomOpt = Option.fromNullishOr(plant.room)
  const diedAtOpt = Option.fromNullishOr(plant.diedAt)
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
    ownership: plant.ownership,
    ownershipLabel: Option.getOrNull(ownershipLabel(plant)),
  }
}
