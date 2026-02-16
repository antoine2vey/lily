import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, nowAsDate, parseApiDate } from '@lily/shared'
import { Calendar, toDateId } from '@marceloterreiro/flash-calendar'
import { Option, pipe } from 'effect'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { useCalendarTheme } from 'src/hooks/useCalendarTheme'
import { useIconColors } from 'src/hooks/useIconColors'

interface DateRangePickerProps {
  startDate: string | null
  endDate: string | null
  onStartDateChange: (dateId: string) => void
  onEndDateChange: (dateId: string) => void
  error?: string
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  error,
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation('delegations')
  const iconColors = useIconColors()
  const calendarTheme = useCalendarTheme()
  const isSelectingEnd = useRef(false)

  const today = nowAsDate()
  const tomorrow = new Date(today.getTime() + 86400000)
  const tomorrowId = toDateId(tomorrow)

  const calendarActiveDateRanges = pipe(
    Option.fromNullable(startDate),
    Option.map((start) => [{ startId: start, endId: endDate ?? start }]),
    Option.getOrElse(() => [] as { startId: string; endId: string }[])
  )

  const handleDayPress = useCallback(
    (dateId: string) => {
      if (!isSelectingEnd.current || !startDate) {
        onStartDateChange(dateId)
        onEndDateChange(dateId)
        isSelectingEnd.current = true
      } else {
        if (dateId < startDate) {
          onStartDateChange(dateId)
          onEndDateChange(dateId)
        } else {
          onEndDateChange(dateId)
        }
        isSelectingEnd.current = false
      }
    },
    [startDate, onStartDateChange, onEndDateChange]
  )

  const formatDate = (dateId: string | null): string =>
    pipe(
      Option.fromNullable(dateId),
      Option.flatMap((id) => parseApiDate(id)),
      Option.map((dt) => formatShortDate(dt)),
      Option.getOrElse(() => t('dateRange.selectDate'))
    )

  return (
    <View className="gap-2">
      <Text
        className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300"
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {t('dateRange.label')}
      </Text>

      {/* Selected range summary */}
      <View className="flex-row gap-3">
        <View className="flex-1 flex-row items-center rounded-2xl px-4 py-3.5 bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50">
          <MaterialIcons
            name="calendar-today"
            size={18}
            color={iconColors.primary}
          />
          <View className="flex-1 ml-2">
            <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
              {t('dateRange.start')}
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
        </View>

        <View className="flex-1 flex-row items-center rounded-2xl px-4 py-3.5 bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50">
          <MaterialIcons name="event" size={18} color={iconColors.primary} />
          <View className="flex-1 ml-2">
            <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
              {t('dateRange.end')}
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
        </View>
      </View>

      {error && (
        <Text className="text-xs ml-1 font-medium text-error">{error}</Text>
      )}

      {/* Flash Calendar */}
      <View
        className="mt-2 rounded-2xl overflow-hidden bg-surface dark:bg-surface-dark px-2 py-3"
        style={{ height: 350 }}
      >
        <Calendar.List
          calendarActiveDateRanges={calendarActiveDateRanges}
          onCalendarDayPress={handleDayPress}
          calendarMinDateId={tomorrowId}
          calendarInitialMonthId={tomorrowId}
          calendarFormatLocale={i18n.language}
          theme={calendarTheme}
        />
      </View>
    </View>
  )
}
