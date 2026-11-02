import { useLocalSearchParams } from 'expo-router'
import { CanopyInvitationScreen } from '@/screens/canopy-join'

export default function CanopyInvitationRoute() {
  const { invitationId } = useLocalSearchParams<{ invitationId?: string }>()
  return <CanopyInvitationScreen rawId={invitationId} />
}
