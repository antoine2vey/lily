import { Match, pipe } from 'effect'
import { useAuth } from '@/contexts/AuthContext'
import { useEffectQuery } from '@/utils/client'

export function useUser() {
  const { state } = useAuth()

  const isAuthenticated = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, () => true),
    Match.when({ _tag: 'NeedsUsername' }, () => true),
    Match.orElse(() => false)
  )

  return useEffectQuery(
    'users',
    'getUserSettings',
    {},
    { enabled: isAuthenticated }
  )
}
