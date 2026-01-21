import { useQuery } from '@tanstack/react-query'

interface Plant {
  id: string
  name: string
  imageUrl?: string
}

async function fetchPlants(): Promise<Plant[]> {
  // TODO: Implement actual API call when backend is ready
  // const plants = await api.plants.list()
  // return plants

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Mock response
  return [
    {
      id: 'plant-1',
      name: 'Monstera Deliciosa',
      imageUrl: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b',
    },
    {
      id: 'plant-2',
      name: 'Snake Plant',
      imageUrl: 'https://images.unsplash.com/photo-1593482892540-61f2b4d6eb0d',
    },
    {
      id: 'plant-3',
      name: 'Pothos',
      imageUrl: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b',
    },
    {
      id: 'plant-4',
      name: 'Fiddle Leaf Fig',
      imageUrl: 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a',
    },
  ]
}

export function usePlants() {
  return useQuery({
    queryKey: ['plants'],
    queryFn: fetchPlants,
  })
}
