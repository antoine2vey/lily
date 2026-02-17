import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe, String } from 'effect'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIconColors } from '@/hooks/useIconColors'

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

export { TIMEZONE_OPTIONS }

interface TimezonePickerModalProps {
  visible: boolean
  onClose: () => void
  selectedTimezone: string
  onTimezoneChange: (timezone: string) => void
}

export function TimezonePickerModal({
  visible,
  onClose,
  selectedTimezone,
  onTimezoneChange,
}: TimezonePickerModalProps) {
  const { t } = useTranslation('notifications')
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const [search, setSearch] = useState('')

  const filteredTimezones = useMemo(
    () =>
      Array.filter(
        TIMEZONE_OPTIONS,
        (tz) =>
          String.isEmpty(search) ||
          pipe(
            String.toLowerCase(tz.label),
            String.includes(String.toLowerCase(search))
          ) ||
          pipe(
            String.toLowerCase(tz.value),
            String.includes(String.toLowerCase(search))
          )
      ),
    [search]
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        {/* Modal Header */}
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={onClose}
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
              value={search}
              onChangeText={setSearch}
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
                onPress={() => onTimezoneChange(tz.value)}
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
                {selectedTimezone === tz.value && (
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
      </View>
    </Modal>
  )
}
