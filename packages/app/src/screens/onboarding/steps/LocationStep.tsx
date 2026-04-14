import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocationPermission } from '@/hooks/useLocationPermission'

interface LocationStepProps {
  onNext: (data: {
    weatherEnabled: boolean
    latitude?: number
    longitude?: number
  }) => void
  onSkip: () => void
}

export function LocationStep({ onNext, onSkip }: LocationStepProps) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const { loading, requestPermission } = useLocationPermission()

  const handleEnable = async () => {
    const location = await requestPermission()
    if (location) {
      onNext({
        weatherEnabled: true,
        latitude: location.latitude,
        longitude: location.longitude,
      })
    } else {
      // Permission denied — still advance but mark as disabled
      onNext({ weatherEnabled: false })
    }
  }

  return (
    <View className="flex-1 px-6 pt-12">
      {/* Illustration */}
      <View className="items-center mb-10">
        <View className="w-40 h-40 rounded-3xl items-center justify-center bg-amber-50 dark:bg-slate-800">
          <MaterialIcons name="wb-sunny" size={80} color={iconColors.warning} />
        </View>
      </View>

      <Text
        className="text-2xl font-bold text-text-primary dark:text-white text-center mb-2"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {t('location.title')}
      </Text>
      <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-10">
        {t('location.subtitle')}
      </Text>

      <View className="gap-3 mt-auto mb-4">
        <Pressable
          onPress={handleEnable}
          disabled={loading}
          className="flex-row items-center justify-center py-4 rounded-full bg-primary active:bg-primary-dark"
        >
          {loading ? (
            <ActivityIndicator size="small" color={iconColors.white} />
          ) : (
            <>
              <MaterialIcons
                name="location-on"
                size={20}
                color={iconColors.white}
              />
              <Text
                className="text-base font-semibold text-white ml-2"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('location.enable')}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={onSkip} className="py-3 items-center">
          <Text className="text-sm text-text-muted dark:text-slate-500">
            {t('location.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
