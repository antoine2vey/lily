import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from 'react-native'

export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      // TODO: Wire to DELETE /users/me endpoint when backend supports it
      throw new Error('Account deletion is not yet available')
    },
    onSuccess: () => {
      queryClient.clear()
    },
    onError: () => {
      Alert.alert(
        'Not Available',
        'Account deletion is not yet available. Please contact support.'
      )
    },
  })
}
