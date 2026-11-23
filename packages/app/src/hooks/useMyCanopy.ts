import { useEffectQuery } from '@/utils/client'
import { MY_CANOPY_PARAMS } from '@/utils/query-keys'

export function useMyCanopy(options?: { enabled?: boolean }) {
  return useEffectQuery('canopy', 'getMyCanopy', MY_CANOPY_PARAMS, options)
}
