import { Option } from 'effect'
import type { InviteToken } from '@/utils/canopy-invite-token'
import { useEffectQuery } from '@/utils/client'

/** The public preview of an invite: Canopy name, inviter and member count. */
export function useCanopyInvite(
  token: Option.Option<InviteToken>,
  options?: { enabled?: boolean }
) {
  return useEffectQuery(
    'canopy-invites',
    'previewCanopyInvite',
    {
      headers: {},
      payload: { token: Option.getOrElse(token, () => '') },
    },
    {
      enabled: Option.isSome(token) && (options?.enabled ?? true),
      retry: false,
    }
  )
}
