import { MaterialIcons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SectionHeader } from 'src/components/SectionHeader'
import { ToggleRow } from 'src/components/ToggleRow'
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from 'src/hooks/useNotificationSettings'
import { iconColors } from 'src/theme'

function parseTime(timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatTimeString(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

export function NotificationSettingsScreen() {
  const { data: settings, isLoading } = useNotificationSettings()
  const { mutate: updateSettings } = useUpdateNotificationSettings()

  const [showTimePicker, setShowTimePicker] = useState<
    'reminder' | 'dndStart' | 'dndEnd' | null
  >(null)

  type BooleanSettingKey =
    | 'careReminders'
    | 'weeklyDigest'
    | 'achievements'
    | 'tips'
    | 'productUpdates'
    | 'doNotDisturb'

  const handleToggle = (key: BooleanSettingKey, value: boolean) => {
    if (!settings) return
    updateSettings({ [key]: value })
  }

  const handleTimeChange = (
    key: 'reminderTime' | 'doNotDisturbStart' | 'doNotDisturbEnd',
    date: Date
  ) => {
    updateSettings({ [key]: formatTimeString(date) })
    if (Platform.OS === 'android') {
      setShowTimePicker(null)
    }
  }

  if (isLoading || !settings) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
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
          Notification Settings
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Care Reminders Section */}
        <View className="px-6 py-4">
          <SectionHeader title="Care Reminders" />
          <View className="mt-2">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="notifications-active"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Care Reminders"
              description="Get reminded when it's time to water or fertilize"
              value={settings.careReminders}
              onValueChange={(value) => handleToggle('careReminders', value)}
            />

            {settings.careReminders && (
              <Pressable
                onPress={() => setShowTimePicker('reminder')}
                className="flex-row items-center py-3 ml-13"
              >
                <MaterialIcons
                  name="access-time"
                  size={18}
                  color={iconColors.textMuted}
                />
                <Text className="flex-1 text-base ml-3 font-regular text-text-primary">
                  Daily Reminder Time
                </Text>
                <Text className="text-base font-medium text-primary">
                  {formatTime(parseTime(settings.reminderTime))}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Updates & Alerts Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Updates & Alerts" />
          <View className="mt-2">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="email"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Weekly Digest"
              description="Receive a weekly summary of your plant care"
              value={settings.weeklyDigest}
              onValueChange={(value) => handleToggle('weeklyDigest', value)}
            />

            <ToggleRow
              icon={
                <MaterialIcons
                  name="emoji-events"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Achievements"
              description="Get notified when you unlock achievements"
              value={settings.achievements}
              onValueChange={(value) => handleToggle('achievements', value)}
            />

            <ToggleRow
              icon={
                <MaterialIcons
                  name="lightbulb"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Plant Tips"
              description="Receive helpful plant care tips"
              value={settings.tips}
              onValueChange={(value) => handleToggle('tips', value)}
            />

            <ToggleRow
              icon={
                <MaterialIcons
                  name="campaign"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Product Updates"
              description="Learn about new features and improvements"
              value={settings.productUpdates}
              onValueChange={(value) => handleToggle('productUpdates', value)}
            />
          </View>
        </View>

        {/* Do Not Disturb Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Do Not Disturb" />
          <View className="mt-2">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="do-not-disturb"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Do Not Disturb"
              description="Silence notifications during quiet hours"
              value={settings.doNotDisturb}
              onValueChange={(value) => handleToggle('doNotDisturb', value)}
            />

            {settings.doNotDisturb && (
              <View className="ml-13">
                <Pressable
                  onPress={() => setShowTimePicker('dndStart')}
                  className="flex-row items-center py-3"
                >
                  <Text className="flex-1 text-base font-regular text-text-primary">
                    Start Time
                  </Text>
                  <Text className="text-base font-medium text-primary">
                    {formatTime(parseTime(settings.doNotDisturbStart))}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowTimePicker('dndEnd')}
                  className="flex-row items-center py-3"
                >
                  <Text className="flex-1 text-base font-regular text-text-primary">
                    End Time
                  </Text>
                  <Text className="text-base font-medium text-primary">
                    {formatTime(parseTime(settings.doNotDisturbEnd))}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Time Pickers */}
      {showTimePicker && (
        <DateTimePicker
          value={
            showTimePicker === 'reminder'
              ? parseTime(settings.reminderTime)
              : showTimePicker === 'dndStart'
                ? parseTime(settings.doNotDisturbStart)
                : parseTime(settings.doNotDisturbEnd)
          }
          mode="time"
          display="spinner"
          onChange={(_event: unknown, selectedTime: Date | undefined) => {
            if (Platform.OS === 'android') {
              setShowTimePicker(null)
            }
            if (selectedTime) {
              if (showTimePicker === 'reminder') {
                handleTimeChange('reminderTime', selectedTime)
              } else if (showTimePicker === 'dndStart') {
                handleTimeChange('doNotDisturbStart', selectedTime)
              } else {
                handleTimeChange('doNotDisturbEnd', selectedTime)
              }
            }
          }}
        />
      )}
    </SafeAreaView>
  )
}
