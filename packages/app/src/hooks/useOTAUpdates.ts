import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState } from 'react-native'
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

  // When download completes, show a toast prompting the user to reload
  useEffect(() => {
    if (isUpdatePending) {
      toast.info(t('update.available'), {
        duration: 10000,
        action: {
          label: t('update.reload'),
          onClick: () => Updates.reloadAsync(),
        },
      })
    }
  }, [isUpdatePending, t])

  // Report check/download errors to Sentry so they're visible in dashboards
  useEffect(() => {
    if (checkError) {
      Sentry.captureException(checkError, {
        tags: { source: 'ota-update', phase: 'check' },
      })
    }
  }, [checkError])

  useEffect(() => {
    if (downloadError) {
      Sentry.captureException(downloadError, {
        tags: { source: 'ota-update', phase: 'download' },
      })
    }
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
