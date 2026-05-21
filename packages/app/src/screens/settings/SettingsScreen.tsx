import { MaterialIcons } from '@expo/vector-icons'
import type { TemperatureUnit } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Array, Match, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GlassBackButton } from '@/components/GlassBackButton'
import { SkeletonBox } from '@/components/skeletons'
import { WEBSITE_BASE_URL } from '@/constants/urls'
import { useAuth } from '@/contexts/AuthContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocalization } from '@/hooks/useLocalization'
import { useOnboardingComplete } from '@/hooks/useOnboardingComplete'
import { useTheme } from '@/hooks/useTheme'
import { useUser } from '@/hooks/useUser'
import { useWelcomeSeen } from '@/hooks/useWelcomeSeen'
import { LanguageSelectionModal } from '@/screens/settings/components/LanguageSelectionModal'
import { SettingsMenuItem } from '@/screens/settings/components/SettingsMenuItem'
import { TemperatureUnitModal } from '@/screens/settings/components/TemperatureUnitModal'
import { ThemeSelectionModal } from '@/screens/settings/components/ThemeSelectionModal'
import { apiEffectRunner } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

type Theme = 'light' | 'dark' | 'system'

export function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const queryClient = useQueryClient()
  const {
    data: userSettings,
    isLoading: isLoadingUser,
    error,
    refetch: _refetch,
  } = useUser()
  const refetch = _refetch as () => void
  const { logout } = useAuth()
  const { resetOnboarding } = useOnboardingComplete()
  const { resetWelcome } = useWelcomeSeen()
  const { theme, setTheme } = useTheme()
  const { t, language, supportedLanguages } = useLocalization()
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showLanguageModal, setShowLanguageModal] = useState(false)
  const [showTempUnitModal, setShowTempUnitModal] = useState(false)

  const currentTempUnit: TemperatureUnit =
    userSettings?.temperatureUnit ?? 'celsius'

  const getTempUnitLabel = (): string =>
    pipe(
      Match.value(currentTempUnit),
      Match.when('celsius', () => '°C'),
      Match.when('fahrenheit', () => '°F'),
      Match.exhaustive
    )

  const handleTempUnitSelect = async (unit: TemperatureUnit) => {
    await apiEffectRunner('users', 'updateUserSettings', {
      payload: { temperatureUnit: unit },
    })
    queryClient.invalidateQueries({ queryKey: queryKeys.users.settings() })
  }

  const getThemeLabel = (themeValue: Theme): string =>
    pipe(
      Match.value(themeValue),
      Match.when('light', () => t('settings:appearance.themeLight')),
      Match.when('dark', () => t('settings:appearance.themeDark')),
      Match.when('system', () => t('settings:appearance.themeSystem')),
      Match.exhaustive
    )

  const getLanguageLabel = (): string =>
    pipe(
      Array.findFirst(supportedLanguages, (lang) => lang.code === language),
      (opt) =>
        opt._tag === 'Some'
          ? opt.value.nativeName
          : t('settings:appearance.languageFallback')
    )

  const isInitialLoading = isLoadingUser && !userSettings
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
        <View className="flex-row items-center px-4 py-3">
          <View className="w-10 h-10" />
          <View className="flex-1 items-center mr-10">
            <SkeletonBox width={100} height={20} rounded="sm" />
          </View>
        </View>
        <Animated.View entering={FadeIn.duration(300)} className="px-4 pt-6">
          {Array.map([1, 2, 3], (i) => (
            <View key={i} className="mb-6">
              <View className="ml-3 mb-2">
                <SkeletonBox width={80} height={12} rounded="sm" />
              </View>
              <SkeletonBox width="100%" height={56} rounded="2xl" />
            </View>
          ))}
        </Animated.View>
      </View>
    )
  }

  if (isInitialLoading) {
    return null
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <GlassBackButton />
        <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
          {t('settings:title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 24 }}
      >
        {/* Appearance Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('settings:sections.appearance')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="contrast"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:appearance.theme')}
              value={getThemeLabel(theme)}
              showBorder
              onPress={() => setShowThemeModal(true)}
            />
            <SettingsMenuItem
              testID="settings-language-row"
              icon={
                <MaterialIcons
                  name="language"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:appearance.language')}
              value={getLanguageLabel()}
              showBorder
              onPress={() => setShowLanguageModal(true)}
            />
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="thermostat"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:appearance.temperatureUnit')}
              value={getTempUnitLabel()}
              onPress={() => setShowTempUnitModal(true)}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('settings:sections.notifications')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="notifications"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:notifications.push')}
              onPress={() => router.push('/notification-settings')}
            />
          </View>
        </View>

        {/* Privacy Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('settings:sections.privacy')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="security"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:privacy.title')}
              onPress={() => router.push('/privacy-settings')}
            />
          </View>
        </View>

        {/* Support Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('settings:sections.support')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="help-outline"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:support.helpCenter')}
              showBorder
              onPress={() => Linking.openURL(`${WEBSITE_BASE_URL}/${language}`)}
            />
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="chat-bubble-outline"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:support.contactUs')}
              showBorder
              onPress={() => Linking.openURL('mailto:support@withlily.app')}
            />
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="info-outline"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:about.version')}
              onPress={() => router.push('/about')}
            />
          </View>
        </View>

        {/* Dev Tools (only visible in development) */}
        {__DEV__ && (
          <View className="mb-6">
            <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
              DEV TOOLS
            </Text>
            <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
              <SettingsMenuItem
                icon={
                  <MaterialIcons
                    name="replay"
                    size={22}
                    color={iconColors.warning}
                  />
                }
                title="Reset Onboarding"
                showChevron={false}
                showBorder
                onPress={async () => {
                  await resetOnboarding()
                  Alert.alert(
                    'Onboarding Reset',
                    'Restart the app to see the onboarding flow.'
                  )
                }}
              />
              <SettingsMenuItem
                icon={
                  <MaterialIcons
                    name="restart-alt"
                    size={22}
                    color={iconColors.warning}
                  />
                }
                title="Reset Welcome"
                showChevron={false}
                onPress={async () => {
                  await resetWelcome()
                  Alert.alert(
                    'Welcome Reset',
                    'Log out and restart the app to see the welcome carousel.'
                  )
                }}
              />
            </View>
          </View>
        )}

        {/* Account Actions Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('settings:sections.account')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <SettingsMenuItem
              icon={
                <MaterialIcons
                  name="logout"
                  size={22}
                  color={iconColors.textMuted}
                />
              }
              title={t('settings:account.signOut')}
              showChevron={false}
              onPress={() => logout()}
            />
          </View>
        </View>

        {/* Delete Account Button */}
        <View className="mt-4">
          <Pressable
            className="bg-surface dark:bg-surface-dark rounded-2xl py-4 items-center shadow-sm border border-border/30 dark:border-slate-700/30"
            onPress={() =>
              Alert.alert(
                t('settings:deleteAccount.title'),
                t('settings:deleteAccount.warning'),
                [
                  {
                    text: t('settings:deleteAccount.cancelButton'),
                    style: 'cancel',
                  },
                  {
                    text: t('settings:deleteAccount.confirmButton'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await apiEffectRunner('users', 'deleteAccount', {})
                        await logout()
                      } catch {
                        Alert.alert(
                          t('settings:deleteAccount.errorTitle'),
                          t('settings:deleteAccount.errorMessage')
                        )
                      }
                    },
                  },
                ]
              )
            }
          >
            <Text className="text-base font-bold text-coral">
              {t('settings:privacy.deleteAccount')}
            </Text>
          </Pressable>
        </View>

        {/* Version Footer */}
        <View className="py-8 items-center">
          <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
            {t('settings:about.version')} 1.0.0
          </Text>
        </View>
      </ScrollView>

      {/* Theme Selection Modal */}
      <ThemeSelectionModal
        visible={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        currentTheme={theme}
        onSelect={setTheme}
      />

      {/* Language Selection Modal */}
      <LanguageSelectionModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />

      {/* Temperature Unit Modal */}
      <TemperatureUnitModal
        visible={showTempUnitModal}
        onClose={() => setShowTempUnitModal(false)}
        currentUnit={currentTempUnit}
        onSelect={handleTempUnitSelect}
      />
    </View>
  )
}
