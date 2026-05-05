import { useEffectMutation } from '@/utils/client'

export function useCreateConversation() {
  return useEffectMutation('aiChat', 'createConversation')
}
