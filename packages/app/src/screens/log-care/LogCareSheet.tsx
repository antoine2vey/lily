import { MaterialIcons } from '@expo/vector-icons'
import {
  formatShortDate,
  formatTime,
  nowAsDate,
  parseApiDate,
} from '@lily/shared'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Array, Option, pipe, String } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { BottomSheet } from 'src/components/BottomSheet'
import { Button } from 'src/components/ui/Button'
import { useIconColors } from 'src/hooks/useIconColors'
import { useSaveCareLog } from 'src/hooks/useSaveCareLog'
import {
  type CareType,
  CareTypeChips,
} from 'src/screens/log-care/components/CareTypeChips'
import { PlantSelector } from 'src/screens/log-care/components/PlantSelector'

interface Plant {
  id: string
  name: string
  imageUrl?: string | null
}

interface LogCareSheetProps {
  visible: boolean
  onClose: () => void
  defaultPlantId?: string
  defaultPlant?: Plant
  onSuccess?: () => void
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
  const [careType, setCareType] = useState<CareType>('water')
  const [date, setDate] = useState(nowAsDate)
  const [time, setTime] = useState(nowAsDate)
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  const { t, i18n } = useTranslation('logCare')
  const { mutate: saveCareLog, isPending } = useSaveCareLog()
  const iconColors = useIconColors()

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

  const handleSetNow = () => {
    const now = nowAsDate()
    setDate(now)
    setTime(now)
  }

  const handleSave = () => {
    if (Array.isEmptyReadonlyArray(plantIds)) return

    saveCareLog(
      {
        plantIds,
        type: careType,
        date,
        time,
        notes: String.isNonEmpty(String.trim(notes))
          ? String.trim(notes)
          : undefined,
        photoUrl: Option.getOrUndefined(Option.fromNullable(photo)),
      },
      {
        onSuccess: () => {
          // Reset form
          setPlantIds(defaultPlantId ? [defaultPlantId] : [])
          setCareType('water')
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

  const canSave = !Array.isEmptyReadonlyArray(plantIds)
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

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
                onPress={() => setShowDatePicker(true)}
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
                onPress={() => setShowTimePicker(true)}
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

      {/* Date Picker Modal */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View className="flex-1 justify-end">
            <Pressable
              className="flex-1"
              onPress={() => setShowDatePicker(false)}
            />
            <View
              className={`${isDark ? 'bg-neutral-800' : 'bg-white'} rounded-t-md`}
            >
              <View className="flex-row justify-between items-center px-4 py-3 border-b border-border/20">
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text className="text-base font-medium text-text-muted">
                    {t('datePicker.cancel')}
                  </Text>
                </Pressable>
                <Text
                  className={`text-base font-bold ${isDark ? 'text-white' : 'text-text-primary'}`}
                >
                  {t('datePicker.selectDate')}
                </Text>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text className="text-base font-bold text-primary">
                    {t('datePicker.done')}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_event: unknown, selectedDate: Date | undefined) => {
                  if (selectedDate) {
                    setDate(selectedDate)
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={(_event: unknown, selectedDate: Date | undefined) => {
              setShowDatePicker(false)
              if (selectedDate) {
                setDate(selectedDate)
              }
            }}
          />
        )
      )}

      {/* Time Picker Modal */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View className="flex-1 justify-end">
            <Pressable
              className="flex-1"
              onPress={() => setShowTimePicker(false)}
            />
            <View
              className={`${isDark ? 'bg-neutral-800' : 'bg-white'} rounded-t-md`}
            >
              <View className="flex-row justify-between items-center px-4 py-3 border-b border-border/20">
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Text className="text-base font-medium text-text-muted">
                    {t('datePicker.cancel')}
                  </Text>
                </Pressable>
                <Text
                  className={`text-base font-bold ${isDark ? 'text-white' : 'text-text-primary'}`}
                >
                  {t('datePicker.selectTime')}
                </Text>
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Text className="text-base font-bold text-primary">
                    {t('datePicker.done')}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={time}
                mode="time"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_event: unknown, selectedTime: Date | undefined) => {
                  if (selectedTime) {
                    setTime(selectedTime)
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      ) : (
        showTimePicker && (
          <DateTimePicker
            value={time}
            mode="time"
            display="default"
            onChange={(_event: unknown, selectedTime: Date | undefined) => {
              setShowTimePicker(false)
              if (selectedTime) {
                setTime(selectedTime)
              }
            }}
          />
        )
      )}
    </BottomSheet>
  )
}
