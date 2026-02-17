import DateTimePicker from '@react-native-community/datetimepicker'
import { Match, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Platform,
  Pressable,
  Text,
  useColorScheme,
  View,
} from 'react-native'

export type TimePickerTarget = 'dndStart' | 'dndEnd' | 'notificationTime'

interface TimePickerModalProps {
  target: TimePickerTarget | null
  onClose: () => void
  getValueForTarget: (target: TimePickerTarget) => Date
  onTimeChange: (target: TimePickerTarget, date: Date) => void
}

export function TimePickerModal({
  target,
  onClose,
  getValueForTarget,
  onTimeChange,
}: TimePickerModalProps) {
  const { t } = useTranslation(['notifications', 'common'])
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  if (!target) return null

  const value = getValueForTarget(target)

  const title = pipe(
    Match.value(target),
    Match.when('dndStart', () => t('quietHours.startTime')),
    Match.when('dndEnd', () => t('quietHours.endTime')),
    Match.when('notificationTime', () => t('quietHours.notificationTime')),
    Match.exhaustive
  )

  const handleChange = (_event: unknown, selectedTime: Date | undefined) => {
    if (Platform.OS === 'android') {
      onClose()
    }
    if (selectedTime) {
      onTimeChange(target, selectedTime)
    }
  }

  if (Platform.OS === 'ios') {
    return (
      <Modal
        visible={true}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View className="flex-1 justify-end bg-black/30">
          <View className="bg-surface dark:bg-surface-dark rounded-t-2xl">
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-border/30 dark:border-slate-700/30">
              <Pressable onPress={onClose}>
                <Text className="text-base text-text-muted dark:text-slate-400">
                  {t('quietHours.cancel')}
                </Text>
              </Pressable>
              <Text className="text-base font-semibold text-text-primary dark:text-white">
                {title}
              </Text>
              <Pressable onPress={onClose}>
                <Text className="text-base font-semibold text-primary">
                  {t('quietHours.done')}
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={value}
              mode="time"
              display="spinner"
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={handleChange}
            />
          </View>
        </View>
      </Modal>
    )
  }

  return (
    <DateTimePicker
      value={value}
      mode="time"
      display="spinner"
      onChange={handleChange}
    />
  )
}
