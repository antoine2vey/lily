import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UpdateProfileData {
  name?: string
  username?: string
  bio?: string
  avatarUrl?: string
  isPrivate?: boolean
}

async function updateProfileApi(_data: UpdateProfileData): Promise<void> {
  // TODO: Implement actual API call when backend is ready
  // await api.user.update(data)

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Simulate successful update
  return
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProfileApi,
    onSuccess: () => {
      // Invalidate user query to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
}
