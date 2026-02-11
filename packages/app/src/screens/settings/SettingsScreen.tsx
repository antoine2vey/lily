import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from 'src/contexts/AuthContext'
import { useIconColors } from 'src/hooks/useIconColors'
import { useLocalization } from 'src/hooks/useLocalization'
import { useTheme } from 'src/hooks/useTheme'
import { useUser } from 'src/hooks/useUser'
import { LanguageSelectionModal } from 'src/screens/settings/components/LanguageSelectionModal'
import { SettingsMenuItem } from 'src/screens/settings/components/SettingsMenuItem'
import { ThemeSelectionModal } from 'src/screens/settings/components/ThemeSelectionModal'

type Theme = 'light' | 'dark' | 'system'

export function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { isLoading: isLoadingUser } = useUser()
  const { logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, language, supportedLanguages } = useLocalization()
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showLanguageModal, setShowLanguageModal] = useState(false)

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

  if (isLoadingUser) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </View>
    )
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="arrow-back-ios-new"
            size={20}
            color={iconColors.primary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
          {t('settings:title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 24 }}
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
              icon={
                <MaterialIcons
                  name="language"
                  size={22}
                  color={iconColors.primary}
                />
              }
              title={t('settings:appearance.language')}
              value={getLanguageLabel()}
              onPress={() => setShowLanguageModal(true)}
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
              onPress={() => Linking.openURL('https://lily.app/help')}
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
              onPress={() => Linking.openURL('mailto:support@lily.app')}
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
            disabled
            className="bg-surface dark:bg-surface-dark rounded-2xl py-4 items-center shadow-sm border border-border/30 dark:border-slate-700/30 opacity-50"
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

        {/* Bottom spacer */}
        <View className="h-6" />
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
    </View>
  )
}
