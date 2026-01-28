import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { ListRow } from 'src/components/ListRow'
import { SectionHeader } from 'src/components/SectionHeader'
import { useDeleteAccount } from 'src/hooks/useDeleteAccount'
import { useTheme } from 'src/hooks/useTheme'
import { useUser } from 'src/hooks/useUser'
import { iconColors } from 'src/theme'
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
  const { data: user, isLoading: isLoadingUser } = useUser()
  const { theme, setTheme } = useTheme()
  const { mutate: deleteAccount, isPending: isDeleting } = useDeleteAccount()

  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteAccount = () => {
    deleteAccount(undefined, {
      onSuccess: () => {
        setShowDeleteConfirm(false)
        // TODO: Navigate to login screen after deletion
      },
    })
  }

  if (isLoadingUser) {
    return (
      <SafeAreaView className="flex-1 bg-background">
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
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 py-4">
        <Text className="text-2xl font-bold text-text-primary">Settings</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* TODO: Wire theme switcher to backend */}
        {/* Appearance Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Appearance" />
          <View className="mt-3">
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="contrast"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="Theme"
              subtitle={getThemeLabel(theme)}
              showChevron
              onPress={() => setShowThemeModal(true)}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Notifications" />
          <View className="mt-3">
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="notifications"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="Notification Settings"
              showChevron
              onPress={() => router.push('/notification-settings')}
            />
          </View>
        </View>

        {/* Privacy Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Privacy" />
          <View className="mt-3">
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="security"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="Privacy Settings"
              showChevron
              onPress={() => router.push('/privacy-settings')}
            />
          </View>
        </View>

        {/* Support Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Support" />
          <View className="mt-3">
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="help-outline"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="Help Center"
              showChevron
              onPress={() => Linking.openURL('https://lily.app/help')}
            />
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="chat-bubble-outline"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="Contact Us"
              showChevron
              onPress={() => Linking.openURL('mailto:support@lily.app')}
            />
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="info-outline"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="About Lily"
              showChevron
              onPress={() => router.push('/about')}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Account Actions" />
          <View className="mt-3">
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="logout"
                  size={18}
                  color={iconColors.textMuted}
                />
              }
              title="Sign Out"
              onPress={() => {
                // TODO: Implement sign out
              }}
            />
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="delete-outline"
                  size={18}
                  color={iconColors.coral}
                />
              }
              title="Delete Account"
              destructive
              onPress={() => setShowDeleteConfirm(true)}
            />
          </View>
        </View>

        {/* Version Footer */}
        <View className="px-6 py-8 items-center">
          <Text className="text-xs font-regular text-text-muted">
            Version 1.0.0
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

      {/* Delete Account Confirmation */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title="Delete Account?"
        message="This will permanently delete all your plants, care history, and achievements. This action cannot be undone."
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Account'}
        cancelLabel="Keep Account"
        destructive
        icon={
          <MaterialIcons
            name="delete-forever"
            size={28}
            color={iconColors.coral}
          />
        }
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </SafeAreaView>
  )
}
