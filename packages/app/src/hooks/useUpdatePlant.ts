import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UpdatePlantInput {
  name?: string
  species?: string
  category?: string
  description?: string
  imageUrl?: string
  newImageUri?: string
  wateringFrequency?: number
  fertilizingFrequency?: number
  lightNeeds?: number
  waterNeeds?: number
  humidityNeeds?: number
  petSafe?: boolean
  notificationsEnabled?: boolean
  notes?: string
}

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

async function uploadPlantImage(uri: string): Promise<string> {
  // TODO: Implement actual image upload when API is ready
  const formData = new FormData()
  formData.append('file', {
    uri,
    type: 'image/jpeg',
    name: 'plant.jpg',
  } as unknown as Blob)

  // Mock upload - replace with actual API call
  return uri
}

async function updatePlantApi(
  plantId: string,
  input: UpdatePlantInput & { imageUrl?: string }
): Promise<Plant> {
  // TODO: Implement actual API call when backend is ready
  // const plant = await api.plants.update(plantId, input)
  // return plant

  // Mock response
  return {
    id: plantId,
    name: input.name ?? 'Plant',
    species: input.species,
    category: input.category,
    description: input.description,
    imageUrl: input.imageUrl,
    wateringFrequency: input.wateringFrequency ?? 7,
    fertilizingFrequency: input.fertilizingFrequency ?? 30,
    lightNeeds: input.lightNeeds,
    waterNeeds: input.waterNeeds,
    humidityNeeds: input.humidityNeeds,
    petSafe: input.petSafe,
    notificationsEnabled: input.notificationsEnabled,
    notes: input.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function useUpdatePlant(plantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdatePlantInput): Promise<Plant> => {
      // Upload new photo if changed
      let imageUrl = input.imageUrl
      if (input.newImageUri) {
        imageUrl = await uploadPlantImage(input.newImageUri)
      }

      // Update plant via API
      const plant = await updatePlantApi(plantId, {
        ...input,
        imageUrl,
      })

      return plant
    },
    onSuccess: () => {
      // Invalidate plant queries to refetch
      queryClient.invalidateQueries({ queryKey: ['plant', plantId] })
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}
