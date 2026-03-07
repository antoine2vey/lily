import * as Updates from 'expo-updates'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState } from 'react-native'
import { toast } from 'sonner-native'

/**
 * Checks for OTA updates when the app returns to the foreground.
 * Native checkOnLaunch handles cold-start checks in the background;
 * this hook covers foreground resume, downloads the update, and
 * shows a toast prompting the user to reload.
 */
export function useOTAUpdates() {
  const { t } = useTranslation()

  useEffect(() => {
    if (__DEV__) return

    const checkAndApply = async () => {
      try {
        const result = await Updates.checkForUpdateAsync()
        if (!result.isAvailable) return

        await Updates.fetchUpdateAsync()

        toast.info(t('update.available'), {
          duration: 10000,
          action: {
            label: t('update.reload'),
            onClick: () => Updates.reloadAsync(),
          },
        })
      } catch {
        // Silently ignore — network errors, dev builds, etc.
      }
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAndApply()
      }
    })

    return () => subscription.remove()
  }, [t])
}
