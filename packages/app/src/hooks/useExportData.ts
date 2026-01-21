import { useMutation } from '@tanstack/react-query'
import { Alert } from 'react-native'

async function exportData(): Promise<void> {
  // TODO: Implement actual API call when backend is ready
  // await api.user.exportData()

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 1500))
}

export function useExportData() {
  return useMutation({
    mutationFn: exportData,
    onSuccess: () => {
      Alert.alert(
        'Export Requested',
        'You will receive an email with your data within 24 hours.'
      )
    },
    onError: () => {
      Alert.alert(
        'Export Failed',
        'Unable to request data export. Please try again later.'
      )
    },
  })
}
