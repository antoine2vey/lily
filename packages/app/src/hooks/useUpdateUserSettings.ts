import type { UserSettings, UserSettingsUpdateRequest } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ApiFailure, apiEffectRunner } from '@/utils/client'
import {
  type CacheSnapshot,
  patchCachedResults,
  restoreCachedResults,
} from '@/utils/optimistic-cache'
import { queryKeys } from '@/utils/query-keys'

// Top-level scalar settings only. Nested groups (notifications, privacy,
// weather) have their own hooks.
export type UserSettingsPatch = Pick<
  UserSettingsUpdateRequest,
  'timezone' | 'preferredNotificationTime' | 'temperatureUnit'
>

export function useUpdateUserSettings() {
  const queryClient = useQueryClient()
  return useMutation<
    UserSettings,
    ApiFailure,
    UserSettingsPatch,
    CacheSnapshot
  >({
    mutationFn: (payload) =>
      apiEffectRunner('users', 'updateUserSettings', { payload }),
    onMutate: (payload) =>
      patchCachedResults<UserSettings>(
        queryClient,
        { queryKey: queryKeys.users.settings() },
        (settings) => ({
          ...settings,
          timezone: payload.timezone ?? settings.timezone,
          preferredNotificationTime:
            payload.preferredNotificationTime ??
            settings.preferredNotificationTime,
          temperatureUnit: payload.temperatureUnit ?? settings.temperatureUnit,
        })
      ),
    onError: (_error, _payload, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.users.settings() }),
  })
}
