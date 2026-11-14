import type { CreateConversationRequest } from '@lily/shared/ai-chat'
import { Match } from 'effect'

export type NewChatTarget =
  | { readonly kind: 'general' }
  | { readonly kind: 'plant'; readonly plantId: string; readonly name: string }

export const GENERAL_TARGET: NewChatTarget = { kind: 'general' }

export const newConversationPayload = (
  target: NewChatTarget
): CreateConversationRequest =>
  Match.value(target).pipe(
    Match.when({ kind: 'general' }, () => ({ kind: 'general' as const })),
    Match.when({ kind: 'plant' }, ({ plantId }) => ({
      kind: 'plant' as const,
      plantId,
    })),
    Match.exhaustive
  )
