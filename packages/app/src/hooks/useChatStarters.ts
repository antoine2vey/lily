import { useEffectQuery } from '@/utils/client'

export function useChatStarters(enabled: boolean) {
  return useEffectQuery('aiChat', 'listChatStarters', {}, { enabled })
}
