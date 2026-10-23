import { MaterialIcons } from '@expo/vector-icons'
import {
  type CareType,
  formatShortDate,
  formatTime,
  nowAsDate,
  parseApiDate,
} from '@lily/shared'
import { Calendar, toDateId } from '@marceloterreiro/flash-calendar'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Array, Option, pipe, String } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/Button'
import { useCalendarTheme } from '@/hooks/useCalendarTheme'
import { useIconColors } from '@/hooks/useIconColors'
import { useSaveCareLog } from '@/hooks/useSaveCareLog'
import { CareTypeChips } from '@/screens/log-care/components/CareTypeChips'
import { PlantSelector } from '@/screens/log-care/components/PlantSelector'

interface Plant {
  id: string
  name: string
  imageUrl?: string | null
}

interface LogCareSheetProps {
  visible: boolean
  onClose: () => void
  defaultPlantId?: string | undefined
  defaultPlant?: Plant | undefined
  onSuccess?: (() => void) | undefined
}

export function LogCareSheet({
  visible,
  onClose,
  defaultPlantId,
  defaultPlant,
  onSuccess,
}: LogCareSheetProps) {
  const [plantIds, setPlantIds] = useState<string[]>(
    defaultPlantId ? [defaultPlantId] : []
  )
  const [careType, setCareType] = useState<CareType>('watering')
  const [date, setDate] = useState(nowAsDate)
  const [time, setTime] = useState(nowAsDate)
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  // Pickers expand inline under their pill instead of opening another sheet.
  const [openPicker, setOpenPicker] = useState<'date' | 'time' | null>(null)
  const togglePicker = (picker: 'date' | 'time') =>
    setOpenPicker((current) => (current === picker ? null : picker))

  const { t, i18n } = useTranslation('logCare')
  const { mutate: saveCareLog, isPending } = useSaveCareLog()
  const iconColors = useIconColors()
  const calendarTheme = useCalendarTheme()
  const todayId = toDateId(nowAsDate())

  // Update plant selection when defaultPlantId changes or sheet opens
  useEffect(() => {
    if (visible && defaultPlantId) {
      setPlantIds([defaultPlantId])
    }
  }, [defaultPlantId, visible])

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri)
    }
  }

  const handleCalendarDayPress = (dateId: string) => {
    const [year, month, day] = String.split(dateId, '-')
    const newDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      date.getHours(),
      date.getMinutes()
    )
    setDate(newDate)
    setOpenPicker(null)
  }

  const selectedDateId = toDateId(date)

  const handleSetNow = () => {
    const now = nowAsDate()
    setDate(now)
    setTime(now)
  }

  const handleSave = () => {
    if (Array.isReadonlyArrayEmpty(plantIds)) return

    saveCareLog(
      {
        plantIds,
        type: careType,
        date,
        time,
        notes: String.isNonEmpty(String.trim(notes))
          ? String.trim(notes)
          : undefined,
        photoUrl: Option.getOrUndefined(Option.fromNullishOr(photo)),
      },
      {
        onSuccess: () => {
          // Reset form
          setPlantIds(defaultPlantId ? [defaultPlantId] : [])
          setCareType('watering')
          setDate(nowAsDate())
          setTime(nowAsDate())
          setNotes('')
          setPhoto(null)
          onClose()
          onSuccess?.()
        },
      }
    )
  }

  const formatDateDisplay = (d: Date) =>
    pipe(
      parseApiDate(d),
      Option.map((dt) => formatShortDate(dt, i18n.language)),
      Option.getOrElse(() => t('unknownDate'))
    )

  const formatTimeDisplay = (tm: Date) =>
    pipe(
      parseApiDate(tm),
      Option.map((dt) => formatTime(dt, i18n.language)),
      Option.getOrElse(() => t('unknownDate'))
    )

  const canSave = !Array.isReadonlyArrayEmpty(plantIds)
  const isDark = iconColors.isDark

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('title')}
      snapPoints={['85%']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <PlantSelector
            selectedIds={plantIds}
            onSelectionChange={setPlantIds}
            label={t('selectPlant')}
            initialPlants={defaultPlant ? [defaultPlant] : undefined}
          />

          <CareTypeChips value={careType} onValueChange={setCareType} />

          {/* Date & Time */}
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-2 ml-1">
              <Text className="text-sm font-bold text-text-muted dark:text-slate-400">
                {t('dateTime')}
              </Text>
              <Pressable
                onPress={handleSetNow}
                className="px-3 py-1 rounded-full border border-primary/30 bg-primary/10"
              >
                <Text className="text-xs font-bold text-primary uppercase tracking-wider">
                  {t('now')}
                </Text>
              </Pressable>
            </View>
            <View className="flex-row gap-3">
              {/* Date picker - flex-3 equivalent */}
              <Pressable
                onPress={() => togglePicker('date')}
                className="flex-row items-center h-14 rounded-full bg-surface-tinted dark:bg-slate-800"
                style={{ flex: 3 }}
              >
                <View className="absolute left-4">
                  <MaterialIcons
                    name="calendar-today"
                    size={20}
                    color={iconColors.textMuted}
                  />
                </View>
                <Text className="text-base font-bold text-text-primary dark:text-white pl-12">
                  {formatDateDisplay(date)}
                </Text>
              </Pressable>

              {/* Time picker - flex-2 equivalent */}
              <Pressable
                onPress={() => togglePicker('time')}
                className="flex-row items-center h-14 rounded-full bg-surface-tinted dark:bg-slate-800"
                style={{ flex: 2 }}
              >
                <View className="absolute left-4">
                  <MaterialIcons
                    name="schedule"
                    size={20}
                    color={iconColors.textMuted}
                  />
                </View>
                <Text className="text-base font-bold text-text-primary dark:text-white pl-12">
                  {formatTimeDisplay(time)}
                </Text>
              </Pressable>
            </View>

            {openPicker === 'date' && (
              <View className="mt-3 px-1">
                <Calendar
                  calendarMonthId={`${selectedDateId.slice(0, 7)}-01`}
                  calendarActiveDateRanges={[
                    { startId: selectedDateId, endId: selectedDateId },
                  ]}
                  onCalendarDayPress={handleCalendarDayPress}
                  calendarMaxDateId={todayId}
                  calendarFormatLocale={i18n.language}
                  theme={calendarTheme}
                />
              </View>
            )}

            {openPicker === 'time' &&
              (Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={time}
                  mode="time"
                  display="spinner"
                  themeVariant={isDark ? 'dark' : 'light'}
                  onChange={(_event: unknown, selected: Date | undefined) => {
                    if (selected) setTime(selected)
                  }}
                />
              ) : (
                <DateTimePicker
                  value={time}
                  mode="time"
                  display="default"
                  onChange={(_event: unknown, selected: Date | undefined) => {
                    setOpenPicker(null)
                    if (selected) setTime(selected)
                  }}
                />
              ))}
          </View>

          {/* Notes */}
          <View className="mb-6">
            <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
              {t('notesLabel')}
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('notesPlaceholder')}
              placeholderTextColor={iconColors.textMuted}
              multiline
              numberOfLines={3}
              className="w-full bg-surface-tinted dark:bg-slate-800 rounded-xl p-5 text-base font-medium text-text-primary dark:text-white"
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
          </View>

          {/* Photo */}
          {photo ? (
            <View className="relative mb-6">
              <AnimatedImage
                source={{ uri: photo }}
                className="w-full h-40 rounded-3xl"
              />
              <Pressable
                onPress={() => setPhoto(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <MaterialIcons
                  name="close"
                  size={20}
                  color={iconColors.white}
                />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handlePickPhoto}
              className="h-16 rounded-full flex-row items-center justify-center gap-3 border border-dashed border-border dark:border-slate-700 active:border-primary active:bg-primary/5"
            >
              <View className="p-1 rounded-full bg-surface-tinted dark:bg-slate-800">
                <MaterialIcons
                  name="add-a-photo"
                  size={24}
                  color={iconColors.textMuted}
                />
              </View>
              <Text className="text-sm font-bold text-text-muted dark:text-slate-400 tracking-wide uppercase">
                {t('addPhoto')}
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Save button with gradient background */}
        <View className="absolute bottom-0 left-0 right-0 pt-12 pb-2 px-0 bg-white dark:bg-surface-dark">
          <Button
            onPress={handleSave}
            disabled={!canSave}
            loading={isPending}
            pill
            icon="check"
            iconPosition="left"
          >
            {t('saveButton')}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  )
}
