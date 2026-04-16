import { Stack } from 'expo-router'
import { PlantsScreen } from '@/screens/plants'

export default function PlantsTab() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PlantsScreen />
    </>
  )
}
