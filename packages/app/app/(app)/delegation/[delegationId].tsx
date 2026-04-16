import { Stack } from 'expo-router'
import { DelegationDetailScreen } from '@/screens/delegation-detail'

export default function DelegationDetail() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DelegationDetailScreen />
    </>
  )
}
