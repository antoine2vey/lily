import { router } from 'expo-router'
import type { TFunction } from 'i18next'
import { Alert } from 'react-native'

interface PlantLimit {
  readonly feature: string
  readonly limit: number
  readonly message: string
}

// A full free Canopy gets its own copy, since any member going Premium lifts
// the cap for everyone in it. A personal cap keeps the API's message.
export const showPlantLimitAlert = (
  error: PlantLimit,
  personalTitle: string,
  t: TFunction
): void =>
  error.feature === 'canopy_plants'
    ? Alert.alert(
        t('canopy:paywall.title'),
        t('canopy:paywall.message', { limit: error.limit }),
        [
          { text: t('canopy:paywall.notNow'), style: 'cancel' },
          {
            text: t('canopy:paywall.upgrade'),
            onPress: () => router.push('/subscription/upgrade'),
          },
        ]
      )
    : Alert.alert(personalTitle, error.message)
