import { useQuery } from '@tanstack/react-query'

interface Plant {
  id: string
  name: string
  species?: string
  category?: string
  description?: string
  imageUrl?: string
  wateringFrequency: number
  fertilizingFrequency: number
  lightNeeds?: number
  waterNeeds?: number
  humidityNeeds?: number
  petSafe?: boolean
  notificationsEnabled?: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

async function fetchPlant(plantId: string): Promise<Plant> {
  // TODO: Implement actual API call when backend is ready
  // const plant = await api.plants.findById(plantId)
  // return plant

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Mock response
  return {
    id: plantId,
    name: 'Monstera Deliciosa',
    species: 'Monstera deliciosa',
    category: 'tropical',
    description: 'A beautiful tropical plant with distinctive split leaves.',
    imageUrl: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b',
    wateringFrequency: 7,
    fertilizingFrequency: 30,
    lightNeeds: 50,
    waterNeeds: 60,
    humidityNeeds: 70,
    petSafe: false,
    notificationsEnabled: true,
    notes: 'Keep away from direct sunlight',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function usePlant(plantId: string) {
  return useQuery({
    queryKey: ['plant', plantId],
    queryFn: () => fetchPlant(plantId),
    enabled: !!plantId,
  })
}
