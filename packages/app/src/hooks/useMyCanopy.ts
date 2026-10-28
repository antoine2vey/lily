import { useEffectQuery } from '@/utils/client'

export function useMyCanopy(options?: { enabled?: boolean }) {
  return useEffectQuery('canopy', 'getMyCanopy', {}, options)
}
