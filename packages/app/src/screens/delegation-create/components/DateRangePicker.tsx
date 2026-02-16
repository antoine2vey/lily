import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, nowAsDate, parseApiDate } from '@lily/shared'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Option, pipe } from 'effect'
import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface DateRangePickerProps {
  startDate: Date | null
  endDate: Date | null
  onStartDateChange: (date: Date) => void
  onEndDateChange: (date: Date) => void
  error?: string
}

type PickerMode = 'start' | 'end' | null

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  error,
}: DateRangePickerProps) {
  const iconColors = useIconColors()
  const [showPicker, setShowPicker] = useState<PickerMode>(null)

  const today = nowAsDate()
  const tomorrow = new Date(today.getTime() + 86400000)

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(null)
    }

    if (!selectedDate) return

    if (showPicker === 'start') {
      onStartDateChange(selectedDate)
      if (endDate && selectedDate >= endDate) {
        onEndDateChange(new Date(selectedDate.getTime() + 86400000))
      }
    } else if (showPicker === 'end') {
      onEndDateChange(selectedDate)
    }
  }

  const handleDismiss = () => {
    setShowPicker(null)
  }

  const formatDate = (date: Date | null): string =>
    pipe(
      Option.fromNullable(date),
      Option.flatMap((d) => parseApiDate(d)),
      Option.map((dt) => formatShortDate(dt)),
      Option.getOrElse(() => 'Select date')
    )

  const minimumEndDate = pipe(
    Option.fromNullable(startDate),
    Option.map((d) => new Date(d.getTime() + 86400000)),
    Option.getOrElse(() => tomorrow)
  )

  return (
    <View className="gap-2">
      <Text
        className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300"
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        Date Range
      </Text>

      <View className="flex-row gap-3">
        <Pressable
          onPress={() => setShowPicker('start')}
          className="flex-1 flex-row items-center rounded-2xl px-4 py-3.5 bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50"
        >
          <MaterialIcons
            name="calendar-today"
            size={18}
            color={iconColors.primary}
          />
          <View className="flex-1 ml-2">
            <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
              Start
            </Text>
            <Text
              className={`text-sm font-medium ${
                startDate
                  ? 'text-text-primary dark:text-white'
                  : 'text-text-muted dark:text-slate-400'
              }`}
            >
              {formatDate(startDate)}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setShowPicker('end')}
          className="flex-1 flex-row items-center rounded-2xl px-4 py-3.5 bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50"
        >
          <MaterialIcons name="event" size={18} color={iconColors.primary} />
          <View className="flex-1 ml-2">
            <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
              End
            </Text>
            <Text
              className={`text-sm font-medium ${
                endDate
                  ? 'text-text-primary dark:text-white'
                  : 'text-text-muted dark:text-slate-400'
              }`}
            >
              {formatDate(endDate)}
            </Text>
          </View>
        </Pressable>
      </View>

      {error && (
        <Text className="text-xs ml-1 font-medium text-error">{error}</Text>
      )}

      {showPicker !== null && (
        <View className="mt-2 rounded-2xl overflow-hidden bg-surface dark:bg-surface-dark">
          <DateTimePicker
            value={
              showPicker === 'start'
                ? pipe(
                    Option.fromNullable(startDate),
                    Option.getOrElse(() => tomorrow)
                  )
                : pipe(
                    Option.fromNullable(endDate),
                    Option.getOrElse(() => minimumEndDate)
                  )
            }
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={showPicker === 'start' ? tomorrow : minimumEndDate}
            onChange={handleDateChange}
          />
          {Platform.OS === 'ios' && (
            <Pressable
              onPress={handleDismiss}
              className="items-center py-3 border-t border-border/30 dark:border-slate-700/30"
            >
              <Text className="text-sm font-semibold text-primary">Done</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}
