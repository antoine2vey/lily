import { Stack } from 'expo-router'
import { DelegationCreateScreen } from '@/screens/delegation-create'

export default function DelegationCreate() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DelegationCreateScreen />
    </>
  )
}
