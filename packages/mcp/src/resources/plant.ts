import { formatIsoDate } from '@lily/shared'
import type { PlantDetail } from '@lily/shared/plant'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * MCP resource handler for plant://{plantId}
 * Converts an API PlantDetail into a JSON string for the resource response.
 */
export const readPlantResource = (plant: PlantDetail) =>
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
