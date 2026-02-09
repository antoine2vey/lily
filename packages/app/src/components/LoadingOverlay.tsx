import { ActivityIndicator, Modal, Text, View } from 'react-native'

interface LoadingOverlayProps {
  visible: boolean
  message?: string
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View className="flex-1 items-center justify-center bg-black/60">
        <View className="items-center gap-4">
          <ActivityIndicator size="large" color="#ffffff" />
          {message && (
            <Text className="text-sm font-medium text-white">{message}</Text>
          )}
        </View>
      </View>
    </Modal>
  )
}
