import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ListRow } from 'src/components/ListRow'
import { SectionHeader } from 'src/components/SectionHeader'
import { ToggleRow } from 'src/components/ToggleRow'
import { Button } from 'src/components/ui/Button'
import {
  usePrivacySettings,
  useUpdatePrivacySettings,
} from 'src/hooks/usePrivacySettings'
import { iconColors } from 'src/theme'

export function PrivacySettingsScreen() {
  const { data: settings, isLoading } = usePrivacySettings()
  const { mutate: updateSettings } = useUpdatePrivacySettings()

  const handleToggle = (
    key: 'publicProfile' | 'shareGrowthData' | 'personalizedTips',
    value: boolean
  ) => {
    updateSettings({ [key]: value })
  }

  const handleRequestDeletion = () => {
    Alert.alert(
      'Request Data Deletion',
      'This will delete all your data and close your account. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Deletion',
          style: 'destructive',
          onPress: () =>
            Linking.openURL(
              'mailto:privacy@lily.app?subject=Data Deletion Request'
            ),
        },
      ]
    )
  }

  if (isLoading || !settings) {
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
      <View className="flex-row items-center px-4 py-3 border-b border-border">
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
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary">
          Privacy & Data
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Description */}
        <View className="px-6 py-4">
          <Text className="text-sm font-regular text-text-muted">
            Manage how your data is used to improve your plant care journey.
          </Text>
        </View>

        {/* Visibility & Personalization Section */}
        <View className="px-6 py-4">
          <SectionHeader title="Visibility & Personalization" />
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
              label="Public Profile"
              description="Allow other gardeners to see your plant collection"
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
              label="Share Growth Data"
              description="Contribute anonymous stats to help community research"
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
              label="Personalized Tips"
              description="Use my plant history to suggest care improvements"
              value={settings.personalizedTips}
              onValueChange={(value) => handleToggle('personalizedTips', value)}
            />
          </View>
        </View>

        {/* Legal & Info Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Legal & Info" />
          <View className="mt-3">
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="policy"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="Privacy Policy"
              showChevron
              onPress={() => Linking.openURL('https://lily.app/privacy')}
            />
            <ListRow
              leftIcon={
                <MaterialIcons
                  name="description"
                  size={18}
                  color={iconColors.primary}
                />
              }
              title="Terms of Service"
              showChevron
              onPress={() => Linking.openURL('https://lily.app/terms')}
            />
          </View>
        </View>

        {/* Data Actions Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Your Data" />
          <View className="mt-4 gap-4">
            {/* TODO: Wire export data to real API */}
            <Button variant="secondary" disabled>
              Export My Data (Coming Soon)
            </Button>

            <Pressable
              onPress={handleRequestDeletion}
              className="py-3 items-center"
            >
              <Text className="text-sm font-medium text-coral">
                Request Data Deletion
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
