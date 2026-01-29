import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DateTime } from 'effect'
import { apiEffectRunner } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'
import { createFileFromUri, uploadMultipart } from 'src/utils/upload'

interface UpdateProfileData {
  name?: string
  bio?: string
  avatarUri?: string
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      // Upload avatar if a local URI was provided
      if (data.avatarUri) {
        const timestamp = DateTime.toEpochMillis(DateTime.unsafeNow())
        const file = createFileFromUri(data.avatarUri, {
          name: `avatar-${timestamp}.jpg`,
          type: 'image/jpeg',
        })
        await uploadMultipart<{ url: string }>('/api/users/avatar', [file])
      }

      // Update name/bio via settings endpoint
      await apiEffectRunner('users', 'updateUserSettings', {
        payload: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.bio !== undefined ? { bio: data.bio } : {}),
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.settings() })
    },
  })
}
