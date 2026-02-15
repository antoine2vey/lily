import { useEffectMutation } from 'src/utils/client'

export function useSendNudge() {
  return useEffectMutation('social', 'sendNudge', {})
}
