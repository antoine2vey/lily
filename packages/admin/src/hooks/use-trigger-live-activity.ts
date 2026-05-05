import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export type TriggerOutcomeKind =
  | 'accepted'
  | 'send-error'
  | 'config-error'
  | 'token-invalidated'

export interface TriggerOutcome {
  readonly deviceTokenId: string
  readonly kind: TriggerOutcomeKind
  readonly apnsId?: string
  readonly reason?: string
}

export interface TriggerLiveActivityResponse {
  readonly userId: string
  readonly activityId: string
  readonly contentStateBuilt: boolean
  readonly startTokenCount: number
  readonly outcomes: ReadonlyArray<TriggerOutcome>
}

export const useTriggerLiveActivity = () =>
  useMutation({
    mutationFn: (userId: string) =>
      apiRequest<TriggerLiveActivityResponse>(
        `/api/admin/users/${userId}/live-activity/trigger-start`,
        { method: 'POST' }
      ),
  })
