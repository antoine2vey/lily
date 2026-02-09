import { useEffectQuery } from 'src/utils/client'

export function useCareTasks() {
  return useEffectQuery('careTasks', 'getCareTasks', {})
}
