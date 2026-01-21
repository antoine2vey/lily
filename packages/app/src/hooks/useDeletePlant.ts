import { useMutation, useQueryClient } from '@tanstack/react-query'

async function deletePlantApi(plantId: string): Promise<void> {
  // TODO: Implement actual API call when backend is ready
  // await api.plants.delete(plantId)

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 500))
}

export function useDeletePlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deletePlantApi,
    onSuccess: () => {
      // Invalidate plants list to refetch
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}
