import { useEffectMutation } from '@/utils/client'

export function useSharePlant() {
  return useEffectMutation('plants', 'sharePlant')
}
