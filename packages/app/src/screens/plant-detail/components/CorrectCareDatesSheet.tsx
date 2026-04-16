import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, nowAsDate, parseApiDate } from '@lily/shared'
import { Calendar, toDateId } from '@marceloterreiro/flash-calendar'
import { Option, pipe } from 'effect'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/Button'
import { useCalendarTheme } from '@/hooks/useCalendarTheme'
import { useCorrectCareDates } from '@/hooks/useCorrectCareDates'
import { useIconColors } from '@/hooks/useIconColors'

// API dates may arrive as ISO strings, epoch numbers, or Date objects.
// Always coerce to a validated Date instance.
const toSafeDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null
  // Always go through new Date() to handle strings, numbers, and Date-like objects
  const d = new Date(value as string | number)
  return Number.isNaN(d.getTime()) ? null : d
}

interface CorrectCareDatesSheetProps {
  visible: boolean
  onClose: () => void
  plantId: string
  lastWateredAt: Date | string | number | null
  lastFertilizedAt: Date | string | number | null
  hasFertilization: boolean
}

type EditingField = 'watering' | 'fertilization' | null

interface CalendarModalProps {
  editingField: 'watering' | 'fertilization'
  wateringDate: Date | null
  fertilizationDate: Date | null
  onDayPress: (dateId: string) => void
  onClose: () => void
  isDark: boolean
  todayId: string
  language: string
  calendarTheme: ReturnType<typeof useCalendarTheme>
}

function CalendarModal({
  editingField,
  wateringDate,
  fertilizationDate,
  onDayPress,
  onClose,
  isDark,
  todayId,
  language,
  calendarTheme,
}: CalendarModalProps) {
  const { t } = useTranslation('plants')

  const rawDate = pipe(
    editingField === 'watering'
      ? Option.fromNullable(wateringDate)
      : Option.fromNullable(fertilizationDate),
    Option.getOrElse(() => nowAsDate())
  )
  // Ensure the date is valid before passing to toDateId
  const currentDate =
    rawDate instanceof Date && !Number.isNaN(rawDate.getTime())
      ? rawDate
      : nowAsDate()
  const selectedDateId = toDateId(currentDate)
  // Build a full YYYY-MM-DD for the first of the month so that
  // flash-calendar's fromDateId doesn't receive an incomplete id.
  const monthFirstDayId = `${selectedDateId.slice(0, 7)}-01`

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className={`${isDark ? 'bg-neutral-800' : 'bg-white'} rounded-t-2xl`}
        >
          <View className="flex-row justify-between items-center px-4 py-3 border-b border-border/20">
            <Pressable onPress={onClose}>
              <Text className="text-base font-medium text-text-muted">
                {t('detail.pastCare.title')}
              </Text>
            </Pressable>
            <Pressable onPress={onClose}>
              <Text className="text-base font-bold text-primary">OK</Text>
            </Pressable>
          </View>
          <View className="px-3 py-4">
            <Calendar
              calendarMonthId={monthFirstDayId}
              calendarActiveDateRanges={[
                { startId: selectedDateId, endId: selectedDateId },
              ]}
              onCalendarDayPress={onDayPress}
              calendarMaxDateId={todayId}
              calendarFormatLocale={language}
              theme={calendarTheme}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function CorrectCareDatesSheet({
  visible,
  onClose,
  plantId,
  lastWateredAt,
  lastFertilizedAt,
  hasFertilization,
}: CorrectCareDatesSheetProps) {
  const { t, i18n } = useTranslation('plants')
  const iconColors = useIconColors()
  const calendarTheme = useCalendarTheme()
  const correctCareDates = useCorrectCareDates()
  const insets = useSafeAreaInsets()
  const todayId = toDateId(nowAsDate())
  const isDark = iconColors.isDark

  const safeLastWateredAt = toSafeDate(lastWateredAt)
  const safeLastFertilizedAt = toSafeDate(lastFertilizedAt)

  const [wateringDate, setWateringDate] = useState<Date | null>(
    safeLastWateredAt
  )
  const [fertilizationDate, setFertilizationDate] = useState<Date | null>(
    safeLastFertilizedAt
  )
  const [editingField, setEditingField] = useState<EditingField>(null)

  // Reset state when sheet opens
  useEffect(() => {
    if (visible) {
      setWateringDate(toSafeDate(lastWateredAt))
      setFertilizationDate(toSafeDate(lastFertilizedAt))
      setEditingField(null)
    }
  }, [visible, lastWateredAt, lastFertilizedAt])

  const formatDateDisplay = useCallback(
    (d: Date | null): string =>
      pipe(
        Option.fromNullable(d),
        Option.flatMap((date) => parseApiDate(date)),
        Option.map((dt) => formatShortDate(dt, i18n.language)),
        Option.getOrElse(() => t('detail.correctDates.noDate'))
      ),
    [i18n.language, t]
  )

  const handleCalendarDayPress = useCallback(
    (dateId: string) => {
      const [year, month, day] = dateId.split('-')
      const newDate = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        12,
        0,
        0
      )

      if (editingField === 'watering') {
        setWateringDate(newDate)
      } else if (editingField === 'fertilization') {
        setFertilizationDate(newDate)
      }
      setEditingField(null)
    },
    [editingField]
  )

  const handleSave = useCallback(() => {
    const payload: { lastWateredAt?: Date; lastFertilizedAt?: Date } = {}

    // Only send changed dates
    if (
      wateringDate &&
      wateringDate.getTime() !== safeLastWateredAt?.getTime()
    ) {
      payload.lastWateredAt = wateringDate
    }
    if (
      fertilizationDate &&
      fertilizationDate.getTime() !== safeLastFertilizedAt?.getTime()
    ) {
      payload.lastFertilizedAt = fertilizationDate
    }

    correctCareDates.mutate(
      { path: { id: plantId }, payload },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }, [
    wateringDate,
    fertilizationDate,
    safeLastWateredAt,
    safeLastFertilizedAt,
    plantId,
    correctCareDates,
    onClose,
  ])

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('detail.correctDates.title')}
      snapPoints={['85%']}
    >
      <ScrollView
        className="flex-1 mt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Watering date section */}
        <View className="mb-6">
          <Text className="text-sm font-bold text-text-muted dark:text-slate-400 ml-1 mb-2">
            {t('detail.correctDates.wateringDate')}
          </Text>
          <Pressable
            onPress={() => setEditingField('watering')}
            className="flex-row items-center h-14 rounded-full bg-surface-tinted dark:bg-slate-800 px-4"
          >
            <MaterialIcons
              name="water-drop"
              size={20}
              color={iconColors.waterBlue}
            />
            <Text className="text-base font-bold text-text-primary dark:text-white ml-3 flex-1">
              {formatDateDisplay(wateringDate)}
            </Text>
            <MaterialIcons
              name="edit-calendar"
              size={20}
              color={iconColors.textMuted}
            />
          </Pressable>
        </View>

        {/* Fertilization date section */}
        {hasFertilization && (
          <View className="mb-6">
            <Text className="text-sm font-bold text-text-muted dark:text-slate-400 ml-1 mb-2">
              {t('detail.correctDates.fertilizationDate')}
            </Text>
            <Pressable
              onPress={() => setEditingField('fertilization')}
              className="flex-row items-center h-14 rounded-full bg-surface-tinted dark:bg-slate-800 px-4"
            >
              <MaterialIcons
                name="eco"
                size={20}
                color={iconColors.fertilizerOrange}
              />
              <Text className="text-base font-bold text-text-primary dark:text-white ml-3 flex-1">
                {formatDateDisplay(fertilizationDate)}
              </Text>
              <MaterialIcons
                name="edit-calendar"
                size={20}
                color={iconColors.textMuted}
              />
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Save button */}
      <View
        className="absolute bottom-0 left-0 right-0 pt-12 px-0 bg-white dark:bg-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        <Button
          onPress={handleSave}
          loading={correctCareDates.isPending}
          pill
          icon="check"
          iconPosition="left"
        >
          {t('detail.correctDates.save')}
        </Button>
      </View>

      {/* Calendar Modal - only mounted when editing to avoid invalid date errors */}
      {editingField !== null && (
        <CalendarModal
          editingField={editingField}
          wateringDate={wateringDate}
          fertilizationDate={fertilizationDate}
          onDayPress={handleCalendarDayPress}
          onClose={() => setEditingField(null)}
          isDark={isDark}
          todayId={todayId}
          language={i18n.language}
          calendarTheme={calendarTheme}
        />
      )}
    </BottomSheet>
  )
}
