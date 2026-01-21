import { useQuery } from '@tanstack/react-query'

interface PlantIdentificationResult {
  name: string
  commonName: string
  species: string
  category: string
  environment: string
  confidence: number
  waterNeeds: number
  lightNeeds: number
  humidityNeeds: number
  waterNeedsLabel: string
  lightNeedsLabel: string
  humidityNeedsLabel: string
  suggestedWateringDays: number
  suggestedFertilizingDays: number
}

async function identifyPlantApi(
  photoUri: string
): Promise<PlantIdentificationResult> {
  // TODO: Implement actual API call when backend is ready
  // const formData = new FormData()
  // formData.append('photo', { uri: photoUri, type: 'image/jpeg', name: 'photo.jpg' })
  // const response = await api.plants.identify(formData)
  // return response

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Mock response for demo
  return {
    name: 'Monstera Deliciosa',
    commonName: 'Swiss Cheese Plant',
    species: 'Monstera deliciosa',
    category: 'tropical',
    environment: 'Indoor',
    confidence: 94,
    waterNeeds: 60,
    lightNeeds: 50,
    humidityNeeds: 70,
    waterNeedsLabel: 'Moderate',
    lightNeedsLabel: 'Indirect light',
    humidityNeedsLabel: 'High',
    suggestedWateringDays: 7,
    suggestedFertilizingDays: 30,
  }
}

export function useIdentifyPlant(photoUri: string) {
  return useQuery({
    queryKey: ['identify-plant', photoUri],
    queryFn: () => identifyPlantApi(photoUri),
    enabled: !!photoUri,
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
