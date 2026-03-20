import { Stack } from 'expo-router'
import { NotificationsScreen } from '@/screens/notifications'

export default function Notifications() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <NotificationsScreen />
    </>
  )
}
