import { useEffectMutation } from '@/utils/client'

export function useSendNudge() {
  return useEffectMutation('social', 'sendNudge', {})
}
