import { MaterialIcons } from '@expo/vector-icons'
import { formatTime, makeTimePickerDate, parseApiDate } from '@lily/shared'
import { Array, Match, Option, pipe, String } from 'effect'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GlassBackButton } from '@/components/GlassBackButton'
import { ToggleRow } from '@/components/ToggleRow'
import { useAuth } from '@/contexts/AuthContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/hooks/useNotificationSettings'
import { NotificationSettingsSkeleton } from '@/screens/notification-settings/components/NotificationSettingsSkeleton'
import {
  TimePickerModal,
  type TimePickerTarget,
} from '@/screens/notification-settings/components/TimePickerModal'
import {
  TIMEZONE_OPTIONS,
  TimezonePickerModal,
} from '@/screens/notification-settings/components/TimezonePickerModal'
import { apiEffectRunner } from '@/utils/client'
import { getDeviceTimezone } from '@/utils/notifications'

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
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation(['notifications', 'common'])
  const iconColors = useIconColors()
  const {
    data: settings,
    isLoading,
    error,
    refetch: _refetch,
  } = useNotificationSettings()
  const refetch = _refetch as () => void
  const { mutate: updateSettings } = useUpdateNotificationSettings()
  const { state } = useAuth()

  const [showTimePicker, setShowTimePicker] = useState<TimePickerTarget | null>(
    null
  )
  const [showTimezonePicker, setShowTimezonePicker] = useState(false)
  const [timezone, setTimezone] = useState<string>('UTC')
  const [preferredNotificationTime, setPreferredNotificationTime] =
    useState<string>('09:00')
  const [isLoadingTimezone, setIsLoadingTimezone] = useState(true)

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

  const handleTimeChange = useCallback(
    (key: 'doNotDisturbStart' | 'doNotDisturbEnd', date: Date) => {
      updateSettings({ [key]: formatTimeString(date) })
      if (Platform.OS === 'android') {
        setShowTimePicker(null)
      }
    },
    [updateSettings]
  )

  const getTimePickerValue = useCallback(
    (target: TimePickerTarget): Date =>
      pipe(
        Match.value(target),
        Match.when('dndStart', () =>
          parseTime(settings?.doNotDisturbStart ?? '22:00')
        ),
        Match.when('dndEnd', () =>
          parseTime(settings?.doNotDisturbEnd ?? '07:00')
        ),
        Match.when('notificationTime', () =>
          parseTime(preferredNotificationTime)
        ),
        Match.exhaustive
      ),
    [settings, preferredNotificationTime]
  )

  const handleTimePickerChange = useCallback(
    (target: TimePickerTarget, date: Date) => {
      pipe(
        Match.value(target),
        Match.when('dndStart', () =>
          handleTimeChange('doNotDisturbStart', date)
        ),
        Match.when('dndEnd', () => handleTimeChange('doNotDisturbEnd', date)),
        Match.when('notificationTime', () =>
          handleNotificationTimeChange(date)
        ),
        Match.exhaustive
      )
    },
    [handleTimeChange, handleNotificationTimeChange]
  )

  const isInitialLoading = (isLoading || isLoadingTimezone) && !settings
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
          {t('error', { defaultValue: 'Failed to load settings' })}
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
        <NotificationSettingsSkeleton />
      </View>
    )
  }

  if (isInitialLoading || !settings) {
    return null
  }

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <GlassBackButton />
        <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
          {t('title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 24 }}
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
      </ScrollView>

      <TimePickerModal
        target={showTimePicker}
        onClose={() => setShowTimePicker(null)}
        getValueForTarget={getTimePickerValue}
        onTimeChange={handleTimePickerChange}
      />

      <TimezonePickerModal
        visible={showTimezonePicker}
        onClose={() => setShowTimezonePicker(false)}
        selectedTimezone={timezone}
        onTimezoneChange={handleTimezoneChange}
      />
    </Animated.View>
  )
}
