import { Stack } from 'expo-router'
import { PlantsScreen } from 'src/screens/plants'

export default function PlantsTab() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PlantsScreen />
    </>
  )
}
