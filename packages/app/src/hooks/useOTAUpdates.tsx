import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, Pressable, Text, View } from 'react-native'
import { toast } from 'sonner-native'

/**
 * Reactively tracks OTA updates using the recommended useUpdates() hook.
 *
 * Cold start:  native checkOnLaunch (ALWAYS) downloads in background →
 *              useUpdates() flips isUpdateAvailable → we fetch →
 *              isUpdatePending → toast.
 * Foreground:  manual checkForUpdateAsync() on AppState 'active' →
 *              useUpdates() reacts the same way.
 */
export function useOTAUpdates() {
  const { t } = useTranslation()
  const { isUpdateAvailable, isUpdatePending, checkError, downloadError } =
    Updates.useUpdates()

  // When an update is found (by native check or manual trigger), download it
  useEffect(() => {
    if (isUpdateAvailable) {
      Updates.fetchUpdateAsync().catch(() => {})
    }
  }, [isUpdateAvailable])

  // When download completes, show a one-line toast with reload button on the right
  useEffect(() => {
    if (isUpdatePending) {
      showUpdateToast(t('update.available'), t('update.reload'), () =>
        Updates.reloadAsync()
      )
    }
  }, [isUpdatePending, t])

  // Report check/download errors to Sentry so they're visible in dashboards
  useEffect(() => {
    if (checkError) reportUpdateError(checkError, 'check')
  }, [checkError])

  useEffect(() => {
    if (downloadError) reportUpdateError(downloadError, 'download')
  }, [downloadError])

  // Native checkOnLaunch only runs on cold start — manually check on
  // foreground resume so backgrounded apps also discover updates.
  useEffect(() => {
    if (__DEV__) return

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Updates.checkForUpdateAsync().catch(() => {})
      }
    })

    return () => subscription.remove()
  }, [])
}

/**
 * Normalize an expo-updates error and forward it to Sentry.
 *
 * `checkError`/`downloadError` arrive as plain `{ message }` objects rather
 * than real `Error` instances, which makes Sentry title them
 * "Object captured as exception with keys: message" and group them poorly.
 * We wrap them in a real Error and downgrade transient server/network
 * failures (5xx, timeouts) to `warning` so OTA-server blips stop paging as
 * errors.
 */
function reportUpdateError(error: unknown, phase: 'check' | 'download') {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown })?.message ?? error)
  const isTransient = /HTTP response error 5\d\d|timeout|network/i.test(message)
  Sentry.captureException(error instanceof Error ? error : new Error(message), {
    level: isTransient ? 'warning' : 'error',
    tags: { source: 'ota-update', phase },
  })
}

function showUpdateToast(
  message: string,
  actionLabel: string,
  onAction: () => void
) {
  toast.custom(
    <View className="px-4">
      <View className="flex-row items-center justify-between px-4 py-3 bg-surface dark:bg-surface-dark rounded-2xl shadow-md">
        <Text
          className="text-sm font-semibold text-text-primary dark:text-white flex-shrink"
          numberOfLines={1}
        >
          {message}
        </Text>
        <Pressable
          onPress={onAction}
          className="bg-primary rounded-full px-4 py-1.5 ml-3"
        >
          <Text className="text-sm font-semibold text-white">
            {actionLabel}
          </Text>
        </Pressable>
      </View>
    </View>,
    { duration: 30000 }
  )
}
