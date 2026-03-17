import { useMutation } from '@tanstack/react-query'
import { Alert } from 'react-native'

export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      // TODO: Wire to POST /users/me/export endpoint when backend supports it
      throw new Error('Data export is not yet available')
    },
    onSuccess: () => {
      Alert.alert(
        'Export Requested',
        'You will receive an email with your data within 24 hours.'
      )
    },
    onError: () => {
      Alert.alert(
        'Not Available',
        'Data export is not yet available. Please try again later.'
      )
    },
  })
}
