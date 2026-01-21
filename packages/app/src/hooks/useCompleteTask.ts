import { useMutation, useQueryClient } from '@tanstack/react-query'

async function completeTaskApi(taskId: string): Promise<void> {
  // TODO: Implement actual API call when backend is ready
  // await api.careTasks.complete(taskId)

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))
}

export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeTaskApi,
    onSuccess: () => {
      // Invalidate care tasks to refetch
      queryClient.invalidateQueries({ queryKey: ['care-tasks'] })
    },
  })
}
