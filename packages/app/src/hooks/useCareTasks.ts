import { useEffectQuery } from '@/utils/client'

export function useCareTasks() {
  return useEffectQuery('careTasks', 'getCareTasks', {})
}
