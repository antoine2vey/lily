import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * MCP resource handler for plant://{plantId}
 * Returns full plant data as JSON.
 */
export const readPlantResource = (plantId: string) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const plant = yield* plantRepo.findById(plantId)

    if (!plant) {
      return JSON.stringify({ error: 'Plant not found' })
    }

    return JSON.stringify(
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
          lastCareAt: s.lastCareAt?.toISOString() ?? null,
          nextCareAt: s.nextCareAt?.toISOString() ?? null,
        })),
        dateAdded: plant.dateAdded.toISOString(),
      },
      null,
      2
    )
  }).pipe(Effect.withSpan('MCP.readPlantResource'))
