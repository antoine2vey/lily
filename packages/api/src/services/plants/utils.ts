// Transform database results to match schema expectations
export const transformPlant = (plant: any) => ({
  ...plant,
  description: plant.description ?? undefined,
  imageUrl: plant.imageUrl ?? undefined,
  category: plant.category ?? undefined,
  lastWateredAt: plant.lastWateredAt ?? undefined,
  nextWateringAt: plant.nextWateringAt ?? undefined,
})

// Simple request types
export type PlantByIdRequest = { id: string }
export type PlantDeleteRequest = { id: string }
