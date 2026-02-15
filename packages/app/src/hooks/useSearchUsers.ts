import { String as Str } from 'effect'
import { useEffectQuery } from 'src/utils/client'

export function useSearchUsers(query: string, enabled = true) {
  return useEffectQuery(
    'social',
    'searchUsers',
    {
      urlParams: { query, page: '1', limit: '20' },
    },
    {
      enabled: enabled && Str.isNonEmpty(Str.trim(query)),
    }
  )
}
