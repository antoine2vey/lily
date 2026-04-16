import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ListRow } from '@/components/ListRow'
import { SectionHeader } from '@/components/SectionHeader'
import { SkeletonBox } from '@/components/skeletons'
import { ToggleRow } from '@/components/ToggleRow'
import { Button } from '@/components/ui/Button'
import { WEBSITE_BASE_URL } from '@/constants/urls'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import {
  usePrivacySettings,
  useUpdatePrivacySettings,
} from '@/hooks/usePrivacySettings'
import {
  useToggleWeather,
  useWeatherSettings,
} from '@/hooks/useWeatherSettings'

export function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation(['settings', 'common'])
  const iconColors = useIconColors()
  const {
    data: settings,
    isLoading,
    error,
    refetch: _refetch,
  } = usePrivacySettings()
  const refetch = _refetch as () => void
  const { mutate: updateSettings } = useUpdatePrivacySettings()
  const { data: weatherSettings } = useWeatherSettings()
  const { mutate: toggleWeather } = useToggleWeather()

  const handleToggle = (
    key: 'publicProfile' | 'shareGrowthData' | 'personalizedTips',
    value: boolean
  ) => {
    updateSettings({ [key]: value })
  }

  const handleRequestDeletion = () => {
    Alert.alert(
      t('settings:privacy.requestDeletionTitle'),
      t('settings:privacy.requestDeletionMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('settings:privacy.requestDeletion'),
          style: 'destructive',
          onPress: () =>
            Linking.openURL(
              `mailto:privacy@lily.app?subject=${encodeURIComponent(t('settings:privacy.requestDeletionEmailSubject'))}`
            ),
        },
      ]
    )
  }

  const isInitialLoading = isLoading && !settings
  const showSkeleton = useDelayedLoading(isInitialLoading)

  if (error) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark items-center justify-center p-6"
        style={{ paddingTop: insets.top }}
      >
        <MaterialIcons
          name="error-outline"
          size={48}
          color={iconColors.coral}
        />
        <Text className="text-lg text-center mt-4 font-semibold text-text-primary dark:text-white">
          {t('settings:error', { defaultValue: 'Failed to load settings' })}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-6 px-6 py-3 rounded-full bg-primary"
        >
          <Text className="font-semibold text-white">
            {t('common:buttons.retry', { defaultValue: 'Try Again' })}
          </Text>
        </Pressable>
      </View>
    )
  }

  if (showSkeleton) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
          <View className="w-10 h-10" />
          <View className="flex-1 items-center mr-10">
            <SkeletonBox width={120} height={20} rounded="sm" />
          </View>
        </View>
        <Animated.View entering={FadeIn.duration(300)} className="px-6 py-4">
          <SkeletonBox width="100%" height={14} rounded="sm" />
          <View className="mt-6">
            {Array.map([1, 2, 3], (i) => (
              <View key={i} className="mb-4">
                <SkeletonBox width="100%" height={64} rounded="lg" />
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    )
  }

  if (isInitialLoading || !settings) {
    return null
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary dark:text-white">
          {t('settings:privacy.screenTitle')}
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Description */}
        <View className="px-6 py-4">
          <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
            {t('settings:privacy.description')}
          </Text>
        </View>

        {/* Visibility & Personalization Section */}
        <View className="px-6 py-4">
          <SectionHeader
            title={t('settings:privacy.sections.visibilityPersonalization')}
          />
          <View className="mt-3">
            <ToggleRow
              testID="toggle-public-profile"
              icon={
                <MaterialIcons
                  name="person"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label={t('settings:privacy.publicProfile')}
              description={t('settings:privacy.publicProfileDescription')}
              value={settings.publicProfile}
              onValueChange={(value) => handleToggle('publicProfile', value)}
            />
            <ToggleRow
              icon={
                <MaterialIcons
                  name="insights"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label={t('settings:privacy.shareGrowthData')}
              description={t('settings:privacy.shareGrowthDataDescription')}
              value={settings.shareGrowthData}
              onValueChange={(value) => handleToggle('shareGrowthData', value)}
            />
            <ToggleRow
              icon={
                <MaterialIcons
                  name="lightbulb"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label={t('settings:privacy.personalizedTips')}
              description={t('settings:privacy.personalizedTipsDescription')}
              value={settings.personalizedTips}
              onValueChange={(value) => handleToggle('personalizedTips', value)}
            />
          </View>
        </View>

        {/* Weather & Location Section */}
        <View className="px-6 py-4 border-t border-border dark:border-slate-700">
          <SectionHeader
            title={t(
              'settings:privacy.sections.weatherLocation',
              'Weather & Location'
            )}
          />
          <View className="mt-3">
            <ToggleRow
              testID="toggle-weather"
              icon={
                <MaterialIcons
                  name="cloud"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label={t('settings:privacy.weatherEnabled', 'Weather-based care')}
              description={t(
                'settings:privacy.weatherEnabledDescription',
                'Use your location to adjust care schedules based on local weather conditions'
              )}
              value={weatherSettings?.enabled ?? false}
              onValueChange={(value) => toggleWeather(value)}
            />
          </View>
        </View>

        {/* Legal & Info Section */}
        <View className="px-6 py-4 border-t border-border dark:border-slate-700">
          <SectionHeader title={t('settings:privacy.sections.legalInfo')} />
          <View className="mt-3">
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="policy"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title={t('settings:about.privacyPolicy')}
              showChevron
              onPress={() =>
                Linking.openURL(`${WEBSITE_BASE_URL}/${i18n.language}/privacy`)
              }
            />
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="description"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title={t('settings:about.termsOfService')}
              showChevron
              onPress={() =>
                Linking.openURL(`${WEBSITE_BASE_URL}/${i18n.language}/terms`)
              }
            />
          </View>
        </View>

        {/* Data Actions Section */}
        <View className="px-6 py-4 border-t border-border dark:border-slate-700">
          <SectionHeader title={t('settings:privacy.sections.yourData')} />
          <View className="mt-4 gap-4">
            {/* TODO: Wire export data to real API */}
            <Button variant="secondary" disabled>
              {t('settings:privacy.dataExportComingSoon')}
            </Button>

            <Pressable
              onPress={handleRequestDeletion}
              className="py-3 items-center"
            >
              <Text className="text-sm font-medium text-coral">
                {t('settings:privacy.requestDeletion')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
