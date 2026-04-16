import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { LogCareSheet } from '@/screens/log-care/LogCareSheet'

export default function LogCareRoute() {
  const [visible, setVisible] = useState(true)

  const handleClose = () => {
    setVisible(false)
    router.back()
  }

  return (
    <View className="flex-1">
      <LogCareSheet visible={visible} onClose={handleClose} />
    </View>
  )
}
