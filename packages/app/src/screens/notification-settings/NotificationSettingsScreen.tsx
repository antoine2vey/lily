import { MaterialIcons } from '@expo/vector-icons'
import { formatTime, parseApiDate } from '@lily/shared'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Array, Match, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SectionHeader } from 'src/components/SectionHeader'
import { ToggleRow } from 'src/components/ToggleRow'
import { useAuth } from 'src/contexts/AuthContext'
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from 'src/hooks/useNotificationSettings'
import { iconColors } from 'src/theme'
import { apiEffectRunner } from 'src/utils/client'
import { getDeviceTimezone } from 'src/utils/notifications'

// Common timezone options
const TIMEZONE_OPTIONS = [
  { label: 'UTC', value: 'UTC' },
  { label: 'New York (ET)', value: 'America/New_York' },
  { label: 'Chicago (CT)', value: 'America/Chicago' },
  { label: 'Denver (MT)', value: 'America/Denver' },
  { label: 'Los Angeles (PT)', value: 'America/Los_Angeles' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Paris (CET)', value: 'Europe/Paris' },
  { label: 'Berlin (CET)', value: 'Europe/Berlin' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Shanghai (CST)', value: 'Asia/Shanghai' },
  { label: 'Sydney (AEDT)', value: 'Australia/Sydney' },
  { label: 'Dubai (GST)', value: 'Asia/Dubai' },
  { label: 'Singapore (SGT)', value: 'Asia/Singapore' },
  { label: 'Mumbai (IST)', value: 'Asia/Kolkata' },
  { label: 'São Paulo (BRT)', value: 'America/Sao_Paulo' },
]

function parseTime(timeString: string): Date {
  const parts = timeString.split(':')
  const hours = pipe(
    Array.head(parts),
    Option.map(Number),
    Option.getOrElse(() => 0)
  )
  const minutes = pipe(
    Array.get(parts, 1),
    Option.map(Number),
    Option.getOrElse(() => 0)
  )
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date
}

const formatTimeDisplay = (date: Date): string =>
  pipe(
    parseApiDate(date),
    Option.map(formatTime),
    Option.getOrElse(() => 'Unknown')
  )

function formatTimeString(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function getTimezoneLabel(timezone: string): string {
  return pipe(
    Array.findFirst(TIMEZONE_OPTIONS, (tz) => tz.value === timezone),
    Option.map((tz) => tz.label),
    Option.getOrElse(() => timezone)
  )
}

export function NotificationSettingsScreen() {
  const { data: settings, isLoading } = useNotificationSettings()
  const { mutate: updateSettings } = useUpdateNotificationSettings()
  const { state } = useAuth()

  const [showTimePicker, setShowTimePicker] = useState<
    'dndStart' | 'dndEnd' | 'notificationTime' | null
  >(null)
  const [showTimezonePicker, setShowTimezonePicker] = useState(false)
  const [timezone, setTimezone] = useState<string>('UTC')
  const [preferredNotificationTime, setPreferredNotificationTime] =
    useState<string>('09:00')
  const [isLoadingTimezone, setIsLoadingTimezone] = useState(true)
  const [timezoneSearch, setTimezoneSearch] = useState('')

  // Filter timezone options based on search
  const filteredTimezones = pipe(
    TIMEZONE_OPTIONS,
    Array.filter(
      (tz) =>
        timezoneSearch === '' ||
        tz.label.toLowerCase().includes(timezoneSearch.toLowerCase()) ||
        tz.value.toLowerCase().includes(timezoneSearch.toLowerCase())
    )
  )

  // Load user timezone settings
  useEffect(() => {
    const loadTimezoneSettings = async () => {
      if (state._tag !== 'Authenticated') return

      try {
        const userSettings = await apiEffectRunner(
          'users',
          'getUserSettings',
          {}
        )
        setTimezone(userSettings.timezone || getDeviceTimezone())
        setPreferredNotificationTime(
          userSettings.preferredNotificationTime || '09:00'
        )
      } catch (_error) {
        // Fall back to device timezone on error
        setTimezone(getDeviceTimezone())
      } finally {
        setIsLoadingTimezone(false)
      }
    }

    loadTimezoneSettings()
  }, [state])

  const handleTimezoneChange = useCallback(
    async (newTimezone: string) => {
      if (state._tag !== 'Authenticated') return

      setTimezone(newTimezone)
      setShowTimezonePicker(false)

      try {
        await apiEffectRunner('users', 'updateUserSettings', {
          payload: { timezone: newTimezone },
        })
      } catch (error) {
        console.error('Failed to update timezone:', error)
      }
    },
    [state]
  )

  const handleNotificationTimeChange = useCallback(
    async (date: Date) => {
      if (state._tag !== 'Authenticated') return

      const timeString = formatTimeString(date)
      setPreferredNotificationTime(timeString)

      if (Platform.OS === 'android') {
        setShowTimePicker(null)
      }

      try {
        await apiEffectRunner('users', 'updateUserSettings', {
          payload: { preferredNotificationTime: timeString },
        })
      } catch (error) {
        console.error('Failed to update notification time:', error)
      }
    },
    [state]
  )

  const handleAutoDetectTimezone = useCallback(async () => {
    const detectedTimezone = getDeviceTimezone()
    await handleTimezoneChange(detectedTimezone)
  }, [handleTimezoneChange])

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
    key: 'doNotDisturbStart' | 'doNotDisturbEnd',
    date: Date
  ) => {
    updateSettings({ [key]: formatTimeString(date) })
    if (Platform.OS === 'android') {
      setShowTimePicker(null)
    }
  }

  if (isLoading || !settings || isLoadingTimezone) {
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
                    {formatTimeDisplay(parseTime(settings.doNotDisturbStart))}
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
                    {formatTimeDisplay(parseTime(settings.doNotDisturbEnd))}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Timezone Settings Section */}
        <View className="px-6 py-4 border-t border-border">
          <SectionHeader title="Timezone & Scheduling" />
          <View className="mt-2">
            {/* Preferred Notification Time */}
            <Pressable
              onPress={() => setShowTimePicker('notificationTime')}
              className="flex-row items-center py-3"
            >
              <View className="w-10 h-10 rounded-full bg-surface-tinted items-center justify-center mr-3">
                <MaterialIcons
                  name="schedule"
                  size={18}
                  color={iconColors.primary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-base font-regular text-text-primary">
                  Notification Time
                </Text>
                <Text className="text-sm text-text-muted">
                  When you want to receive care reminders
                </Text>
              </View>
              <Text className="text-base font-medium text-primary">
                {formatTimeDisplay(parseTime(preferredNotificationTime))}
              </Text>
            </Pressable>

            {/* Timezone */}
            <Pressable
              onPress={() => setShowTimezonePicker(true)}
              className="flex-row items-center py-3"
            >
              <View className="w-10 h-10 rounded-full bg-surface-tinted items-center justify-center mr-3">
                <MaterialIcons
                  name="public"
                  size={18}
                  color={iconColors.primary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-base font-regular text-text-primary">
                  Timezone
                </Text>
                <Text className="text-sm text-text-muted">
                  {getTimezoneLabel(timezone)}
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={iconColors.textMuted}
              />
            </Pressable>

            {/* Auto-detect Timezone */}
            <Pressable
              onPress={handleAutoDetectTimezone}
              className="flex-row items-center py-3"
            >
              <View className="w-10 h-10 rounded-full bg-surface-tinted items-center justify-center mr-3">
                <MaterialIcons
                  name="my-location"
                  size={18}
                  color={iconColors.primary}
                />
              </View>
              <Text className="flex-1 text-base font-regular text-text-primary">
                Auto-detect Timezone
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Time Pickers */}
      {showTimePicker && (
        <DateTimePicker
          value={pipe(
            Match.value(showTimePicker),
            Match.when('dndStart', () => parseTime(settings.doNotDisturbStart)),
            Match.when('dndEnd', () => parseTime(settings.doNotDisturbEnd)),
            Match.when('notificationTime', () =>
              parseTime(preferredNotificationTime)
            ),
            Match.exhaustive
          )}
          mode="time"
          display="spinner"
          onChange={(_event: unknown, selectedTime: Date | undefined) => {
            if (Platform.OS === 'android') {
              setShowTimePicker(null)
            }
            if (selectedTime) {
              pipe(
                Match.value(showTimePicker),
                Match.when('dndStart', () =>
                  handleTimeChange('doNotDisturbStart', selectedTime)
                ),
                Match.when('dndEnd', () =>
                  handleTimeChange('doNotDisturbEnd', selectedTime)
                ),
                Match.when('notificationTime', () =>
                  handleNotificationTimeChange(selectedTime)
                ),
                Match.exhaustive
              )
            }
          }}
        />
      )}

      {/* Timezone Picker Modal */}
      <Modal
        visible={showTimezonePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTimezonePicker(false)}
      >
        <SafeAreaView className="flex-1 bg-background">
          {/* Modal Header */}
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <Pressable
              onPress={() => setShowTimezonePicker(false)}
              className="w-10 h-10 items-center justify-center"
            >
              <MaterialIcons
                name="close"
                size={24}
                color={iconColors.textPrimary}
              />
            </Pressable>
            <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary">
              Select Timezone
            </Text>
          </View>

          {/* Search Input */}
          <View className="px-4 py-3">
            <View className="flex-row items-center bg-input-bg rounded-lg px-3">
              <MaterialIcons
                name="search"
                size={20}
                color={iconColors.textMuted}
              />
              <TextInput
                className="flex-1 py-3 px-2 text-base text-text-primary"
                placeholder="Search timezones..."
                placeholderTextColor={iconColors.textMuted}
                value={timezoneSearch}
                onChangeText={setTimezoneSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Timezone List */}
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            {Array.map(filteredTimezones, (tz) => (
              <Pressable
                key={tz.value}
                onPress={() => handleTimezoneChange(tz.value)}
                className="flex-row items-center px-6 py-4 border-b border-border"
              >
                <Text className="flex-1 text-base text-text-primary">
                  {tz.label}
                </Text>
                <Text className="text-sm text-text-muted mr-2">{tz.value}</Text>
                {timezone === tz.value && (
                  <MaterialIcons
                    name="check"
                    size={20}
                    color={iconColors.primary}
                  />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
