import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { formatIsoDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * MCP resource handler for plant://{plantId}
 * Accepts an already-fetched plant to avoid redundant DB queries
 * (the caller verifies ownership via assertPlantAccess first).
 */
export const readPlantResource = (plant: PlantWithRoom) =>
  Effect.sync(() =>
    JSON.stringify(
      {
        id: plant.id,
        name: plant.name,
        category: plant.category,
        health: plant.health,
        description: plant.description,
        imageUrl: plant.imageUrl,
        room: pipe(
          Option.fromNullable(plant.room),
          Option.map((r) => ({
            name: r.name,
            icon: r.icon,
            luminosity: r.luminosity,
            isOutdoor: r.isOutdoor,
          })),
          Option.getOrNull
        ),
        ratings: {
          watering: plant.wateringRating,
          lighting: plant.lightingRating,
          humidity: plant.humidityRating,
          petToxicity: plant.petToxicityRating,
        },
        schedules: Array.map(plant.schedules, (s) => ({
          careType: s.careType,
          frequencyDays: s.frequencyDays,
          lastCareAt: s.lastCareAt ? formatIsoDate(s.lastCareAt) : null,
          nextCareAt: s.nextCareAt ? formatIsoDate(s.nextCareAt) : null,
        })),
        dateAdded: formatIsoDate(plant.dateAdded),
      },
      null,
      2
    )
  ).pipe(Effect.withSpan('MCP.readPlantResource'))
