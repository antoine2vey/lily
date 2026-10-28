import { useLocalSearchParams } from 'expo-router'
import { CanopyJoinScreen } from '@/screens/canopy-join'

export default function JoinRoute() {
  const { token } = useLocalSearchParams<{ token?: string }>()
  return <CanopyJoinScreen rawToken={token} />
}
