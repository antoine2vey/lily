import { Match, pipe } from 'effect'
import { useAuth } from '@/contexts/AuthContext'
import { useEffectQuery } from '@/utils/client'
import { USER_SETTINGS_PARAMS } from '@/utils/query-keys'

export function useUser() {
  const { state } = useAuth()

  const isAuthenticated = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, () => true),
    Match.when({ _tag: 'NeedsUsername' }, () => true),
    Match.orElse(() => false)
  )

  return useEffectQuery('users', 'getUserSettings', USER_SETTINGS_PARAMS, {
    enabled: isAuthenticated,
  })
}
