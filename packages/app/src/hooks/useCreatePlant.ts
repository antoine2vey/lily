import { useMutation, useQueryClient } from '@tanstack/react-query'

interface CreatePlantInput {
  name: string
  species?: string
  category?: string
  imageUri?: string
  wateringFrequency: number
  fertilizingFrequency: number
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
  // For now, return the local URI
  const formData = new FormData()
  formData.append('file', {
    uri,
    type: 'image/jpeg',
    name: 'plant.jpg',
  } as unknown as Blob)

  // Mock upload - replace with actual API call
  // const response = await api.plants.uploadPhoto(formData)
  // return response.url
  return uri
}

async function createPlantApi(
  input: CreatePlantInput & { imageUrl?: string }
): Promise<Plant> {
  // TODO: Implement actual API call when backend is ready
  // For now, return mock data
  // const plant = await api.plants.create(input)
  // return plant

  // Mock response
  return {
    id: `plant-${Date.now()}`,
    name: input.name,
    species: input.species,
    category: input.category,
    imageUrl: input.imageUrl,
    wateringFrequency: input.wateringFrequency,
    fertilizingFrequency: input.fertilizingFrequency,
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

export function useCreatePlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreatePlantInput): Promise<Plant> => {
      // Upload image first if provided
      let imageUrl: string | undefined
      if (input.imageUri) {
        imageUrl = await uploadPlantImage(input.imageUri)
      }

      // Create plant via API
      const plant = await createPlantApi({
        ...input,
        imageUrl,
      })

      return plant
    },
    onSuccess: () => {
      // Invalidate plants list to refetch
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}
