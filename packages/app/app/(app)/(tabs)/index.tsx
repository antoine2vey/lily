import { Stack } from 'expo-router'
import { HomeScreen } from 'src/screens/home'

export default function HomeTab() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <HomeScreen />
    </>
  )
}
