import { API_PREFIX } from '@lily/shared'
import type {
  AdminLiveActivityTriggerOutcome,
  AdminLiveActivityTriggerResponse,
} from '@lily/shared/admin'
import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export type TriggerOutcomeKind = AdminLiveActivityTriggerOutcome['kind']
export type TriggerPushKind = AdminLiveActivityTriggerOutcome['push']

export const useTriggerLiveActivity = () =>
  useMutation({
    mutationFn: (userId: string) =>
      apiRequest<AdminLiveActivityTriggerResponse>(
        `${API_PREFIX}/admin/users/${userId}/live-activity/trigger-start`,
        { method: 'POST' }
      ),
  })
