import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
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
import { useIconColors } from 'src/hooks/useIconColors'
import {
  usePrivacySettings,
  useUpdatePrivacySettings,
} from 'src/hooks/usePrivacySettings'

export function PrivacySettingsScreen() {
  const { t } = useTranslation(['settings', 'common'])
  const iconColors = useIconColors()
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

  if (isLoading || !settings) {
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
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
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
              title={t('settings:about.termsOfService')}
              showChevron
              onPress={() => Linking.openURL('https://lily.app/terms')}
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
    </SafeAreaView>
  )
}
