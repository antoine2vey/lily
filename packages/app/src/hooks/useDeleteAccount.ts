import { useMutation, useQueryClient } from '@tanstack/react-query'

async function deleteAccount(): Promise<void> {
  // TODO: Implement actual API call when backend is ready
  // await api.user.delete()

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      // Clear all cached data
      queryClient.clear()
    },
  })
}
