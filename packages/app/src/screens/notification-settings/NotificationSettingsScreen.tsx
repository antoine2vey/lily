import { MaterialIcons } from '@expo/vector-icons'
import { formatTime, makeTimePickerDate, parseApiDate } from '@lily/shared'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Array, Match, Option, pipe, String } from 'effect'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { ToggleRow } from 'src/components/ToggleRow'
import { useAuth } from 'src/contexts/AuthContext'
import { useIconColors } from 'src/hooks/useIconColors'
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from 'src/hooks/useNotificationSettings'
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
  const parts = String.split(timeString, ':')
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
  // Create a Date object for the time picker (required by DateTimePicker)
  return makeTimePickerDate(hours, minutes)
}

const formatTimeDisplay = (
  date: Date,
  fallback: string,
  locale?: string
): string =>
  pipe(
    parseApiDate(date),
    Option.map((dt) => formatTime(dt, locale)),
    Option.getOrElse(() => fallback)
  )

function formatTimeString(date: Date): string {
  // Extract hours and minutes for API format (HH:MM)
  // Using Date methods here as this is for DateTimePicker interop
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
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
  const { t, i18n } = useTranslation(['notifications', 'common'])
  const iconColors = useIconColors()
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
        String.isEmpty(timezoneSearch) ||
        pipe(
          tz.label,
          String.toLowerCase,
          String.includes(String.toLowerCase(timezoneSearch))
        ) ||
        pipe(
          tz.value,
          String.toLowerCase,
          String.includes(String.toLowerCase(timezoneSearch))
        )
    )
  )

  // Load user timezone settings
  useEffect(() => {
    let cancelled = false

    const loadTimezoneSettings = async () => {
      if (state._tag !== 'Authenticated') return

      try {
        const userSettings = await apiEffectRunner(
          'users',
          'getUserSettings',
          {}
        )
        if (!cancelled) {
          setTimezone(userSettings.timezone || getDeviceTimezone())
          setPreferredNotificationTime(
            userSettings.preferredNotificationTime || '09:00'
          )
        }
      } catch (_error) {
        // Fall back to device timezone on error
        if (!cancelled) {
          setTimezone(getDeviceTimezone())
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTimezone(false)
        }
      }
    }

    loadTimezoneSettings()
    return () => {
      cancelled = true
    }
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
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
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
          {t('title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 24 }}
      >
        {/* Care Reminders Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('sections.careReminders')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="notifications-active"
                  size={22}
                  color={iconColors.primary}
                />
              }
              label={t('careReminders.title')}
              description={t('careReminders.description')}
              value={settings.careReminders}
              onValueChange={(value) => handleToggle('careReminders', value)}
              showBorder
            />

            {/* Notification Time Picker */}
            <Pressable
              onPress={() => setShowTimePicker('notificationTime')}
              className="p-4 bg-surface-tinted/50 dark:bg-slate-800/50"
            >
              <Text className="text-xs font-medium text-text-muted dark:text-slate-400 mb-2 ml-1">
                {t('careReminders.timeLabel')}
              </Text>
              <View className="flex-row items-center bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 rounded-xl py-3 px-4">
                <Text className="flex-1 text-base text-text-primary dark:text-white">
                  {formatTimeDisplay(
                    parseTime(preferredNotificationTime),
                    t('common:unknown'),
                    i18n.language
                  )}
                </Text>
                <MaterialIcons
                  name="expand-more"
                  size={20}
                  color={iconColors.textMuted}
                />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Updates & Alerts Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('sections.updatesAlerts')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="email"
                  size={22}
                  color={iconColors.primary}
                />
              }
              label={t('updates.weeklyDigest.title')}
              description={t('updates.weeklyDigest.description')}
              value={settings.weeklyDigest}
              onValueChange={(value) => handleToggle('weeklyDigest', value)}
              showBorder
            />

            <ToggleRow
              icon={
                <MaterialIcons
                  name="emoji-events"
                  size={22}
                  color={iconColors.primary}
                />
              }
              label={t('updates.achievements.title')}
              description={t('updates.achievements.description')}
              value={settings.achievements}
              onValueChange={(value) => handleToggle('achievements', value)}
              showBorder
            />

            <ToggleRow
              icon={
                <MaterialIcons
                  name="lightbulb"
                  size={22}
                  color={iconColors.primary}
                />
              }
              label={t('updates.tips.title')}
              description={t('updates.tips.description')}
              value={settings.tips}
              onValueChange={(value) => handleToggle('tips', value)}
              showBorder
            />

            <ToggleRow
              icon={
                <MaterialIcons
                  name="campaign"
                  size={22}
                  color={iconColors.primary}
                />
              }
              label={t('updates.productUpdates.title')}
              description={t('updates.productUpdates.description')}
              value={settings.productUpdates}
              onValueChange={(value) => handleToggle('productUpdates', value)}
            />
          </View>
        </View>

        {/* Do Not Disturb Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('sections.doNotDisturb')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="bedtime"
                  size={22}
                  color={iconColors.primary}
                />
              }
              label={t('quietHours.title')}
              description={t('quietHours.description')}
              value={settings.doNotDisturb}
              onValueChange={(value) => handleToggle('doNotDisturb', value)}
              showBorder={settings.doNotDisturb}
            />

            {settings.doNotDisturb && (
              <View className="flex-row border-t border-border/30 dark:border-slate-700/30">
                <Pressable
                  onPress={() => setShowTimePicker('dndStart')}
                  className="flex-1 p-4 items-center border-r border-border/30 dark:border-slate-700/30 active:bg-surface-tinted dark:active:bg-slate-800"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-slate-400 mb-1">
                    {t('quietHours.start')}
                  </Text>
                  <Text className="text-xl font-bold text-text-primary dark:text-white">
                    {formatTimeDisplay(
                      parseTime(settings.doNotDisturbStart),
                      t('common:unknown'),
                      i18n.language
                    )}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowTimePicker('dndEnd')}
                  className="flex-1 p-4 items-center active:bg-surface-tinted dark:active:bg-slate-800"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-slate-400 mb-1">
                    {t('quietHours.end')}
                  </Text>
                  <Text className="text-xl font-bold text-text-primary dark:text-white">
                    {formatTimeDisplay(
                      parseTime(settings.doNotDisturbEnd),
                      t('common:unknown'),
                      i18n.language
                    )}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
          {settings.doNotDisturb && (
            <Text className="text-xs text-text-muted dark:text-slate-400 mt-2 ml-3">
              {t('quietHours.notice')}
            </Text>
          )}
        </View>

        {/* Timezone Settings Section */}
        <View className="mb-6">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400 mb-2 ml-3">
            {t('timezone.title')}
          </Text>
          <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
            {/* Timezone */}
            <Pressable
              onPress={() => setShowTimezonePicker(true)}
              className="flex-row items-center gap-3 p-4 active:bg-surface-tinted dark:active:bg-slate-800 border-b border-border/50 dark:border-slate-700/50"
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center bg-primary-tint dark:bg-primary/20">
                <MaterialIcons
                  name="public"
                  size={22}
                  color={iconColors.primary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-base font-medium text-text-primary dark:text-white">
                  {t('timezone.title')}
                </Text>
                <Text className="text-xs text-text-muted dark:text-slate-400 mt-0.5">
                  {getTimezoneLabel(timezone)}
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={iconColors.border}
              />
            </Pressable>

            {/* Auto-detect Timezone */}
            <Pressable
              onPress={handleAutoDetectTimezone}
              className="flex-row items-center gap-3 p-4 active:bg-surface-tinted dark:active:bg-slate-800"
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center bg-primary-tint dark:bg-primary/20">
                <MaterialIcons
                  name="my-location"
                  size={22}
                  color={iconColors.primary}
                />
              </View>
              <Text className="flex-1 text-base font-medium text-text-primary dark:text-white">
                {t('timezone.autoDetect')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Bottom spacer */}
        <View className="h-6" />
      </ScrollView>

      {/* Time Pickers - iOS Modal wrapper */}
      {showTimePicker && Platform.OS === 'ios' && (
        <Modal
          visible={true}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(null)}
        >
          <View className="flex-1 justify-end bg-black/30">
            <View className="bg-surface dark:bg-surface-dark rounded-t-2xl">
              <View className="flex-row justify-between items-center px-4 py-3 border-b border-border/30 dark:border-slate-700/30">
                <Pressable onPress={() => setShowTimePicker(null)}>
                  <Text className="text-base text-text-muted dark:text-slate-400">
                    {t('quietHours.cancel')}
                  </Text>
                </Pressable>
                <Text className="text-base font-semibold text-text-primary dark:text-white">
                  {pipe(
                    Match.value(showTimePicker),
                    Match.when('dndStart', () => t('quietHours.startTime')),
                    Match.when('dndEnd', () => t('quietHours.endTime')),
                    Match.when('notificationTime', () =>
                      t('quietHours.notificationTime')
                    ),
                    Match.exhaustive
                  )}
                </Text>
                <Pressable onPress={() => setShowTimePicker(null)}>
                  <Text className="text-base font-semibold text-primary">
                    {t('quietHours.done')}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pipe(
                  Match.value(showTimePicker),
                  Match.when('dndStart', () =>
                    parseTime(settings.doNotDisturbStart)
                  ),
                  Match.when('dndEnd', () =>
                    parseTime(settings.doNotDisturbEnd)
                  ),
                  Match.when('notificationTime', () =>
                    parseTime(preferredNotificationTime)
                  ),
                  Match.exhaustive
                )}
                mode="time"
                display="spinner"
                themeVariant="light"
                onChange={(_event: unknown, selectedTime: Date | undefined) => {
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
            </View>
          </View>
        </Modal>
      )}

      {/* Time Pickers - Android */}
      {showTimePicker && Platform.OS === 'android' && (
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
            setShowTimePicker(null)
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
        <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
          {/* Modal Header */}
          <View className="flex-row items-center px-4 py-3">
            <Pressable
              onPress={() => setShowTimezonePicker(false)}
              className="w-10 h-10 items-center justify-center rounded-full"
            >
              <MaterialIcons
                name="close"
                size={24}
                color={iconColors.textPrimary}
              />
            </Pressable>
            <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
              {t('timezone.select')}
            </Text>
          </View>

          {/* Search Input */}
          <View className="px-4 py-3">
            <View className="flex-row items-center bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 rounded-xl px-4">
              <MaterialIcons
                name="search"
                size={20}
                color={iconColors.textMuted}
              />
              <TextInput
                className="flex-1 py-3 px-2 text-base text-text-primary dark:text-white"
                placeholder={t('timezone.search')}
                placeholderTextColor={iconColors.textMuted}
                value={timezoneSearch}
                onChangeText={setTimezoneSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Timezone List */}
          <ScrollView
            className="flex-1 px-4"
            showsVerticalScrollIndicator={false}
          >
            <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
              {Array.map(filteredTimezones, (tz, index) => (
                <Pressable
                  key={tz.value}
                  onPress={() => handleTimezoneChange(tz.value)}
                  className={`flex-row items-center px-4 py-4 active:bg-surface-tinted dark:active:bg-slate-800 ${
                    index < Array.length(filteredTimezones) - 1
                      ? 'border-b border-border/50 dark:border-slate-700/50'
                      : ''
                  }`}
                >
                  <Text className="flex-1 text-base text-text-primary dark:text-white font-medium">
                    {tz.label}
                  </Text>
                  <Text className="text-sm text-text-muted dark:text-slate-400 mr-2">
                    {tz.value}
                  </Text>
                  {timezone === tz.value && (
                    <MaterialIcons
                      name="check"
                      size={20}
                      color={iconColors.primary}
                    />
                  )}
                </Pressable>
              ))}
            </View>
            <View className="h-8" />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
