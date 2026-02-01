import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
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
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from 'src/contexts/AuthContext'
import { useIconColors } from 'src/hooks/useIconColors'
import { useTheme } from 'src/hooks/useTheme'
import { useUser } from 'src/hooks/useUser'
import { SettingsMenuItem } from './components/SettingsMenuItem'
import { ThemeSelectionModal } from './components/ThemeSelectionModal'

type Theme = 'light' | 'dark' | 'system'

const getThemeLabel = (theme: Theme): string =>
  pipe(
    Match.value(theme),
    Match.when('light', () => 'Light'),
    Match.when('dark', () => 'Dark'),
    Match.when('system', () => 'System'),
    Match.exhaustive
  )

export function SettingsScreen() {
  const iconColors = useIconColors()
  const { isLoading: isLoadingUser } = useUser()
  const { logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [showThemeModal, setShowThemeModal] = useState(false)

  if (isLoadingUser) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={['top']}
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
          Settings
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
            Appearance
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
              title="Theme"
              value={getThemeLabel(theme)}
              onPress={() => setShowThemeModal(true)}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            Notifications
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
              title="Push Notifications"
              onPress={() => router.push('/notification-settings')}
            />
          </View>
        </View>

        {/* Privacy Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            Privacy
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
              title="Privacy Settings"
              onPress={() => router.push('/privacy-settings')}
            />
          </View>
        </View>

        {/* Support Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            Support
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
              title="Help Center"
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
              title="Contact Us"
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
              title="About Lily"
              onPress={() => router.push('/about')}
            />
          </View>
        </View>

        {/* Account Actions Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            Account
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
              title="Sign Out"
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
              Delete Account
            </Text>
          </Pressable>
          <Text className="text-xs text-text-muted dark:text-slate-400 text-center mt-2">
            Coming soon
          </Text>
        </View>

        {/* Version Footer */}
        <View className="py-8 items-center">
          <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
            Version 1.0.0
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
    </SafeAreaView>
  )
}
