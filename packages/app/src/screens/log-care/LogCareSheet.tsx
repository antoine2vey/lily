import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, formatTime, parseApiDate } from '@lily/shared'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Option, pipe } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { Button } from 'src/components/ui/Button'
import { Input } from 'src/components/ui/Input'
import { useSaveCareLog } from 'src/hooks/useSaveCareLog'
import { iconColors } from 'src/theme'
import { type CareType, CareTypeChips } from './components/CareTypeChips'
import { PlantSelector } from './components/PlantSelector'

interface LogCareSheetProps {
  visible: boolean
  onClose: () => void
  defaultPlantId?: string
  onSuccess?: () => void
}

export function LogCareSheet({
  visible,
  onClose,
  defaultPlantId,
  onSuccess,
}: LogCareSheetProps) {
  const [plantIds, setPlantIds] = useState<string[]>([])
  const [careType, setCareType] = useState<CareType>('water')
  const [date, setDate] = useState(new Date())
  const [time, setTime] = useState(new Date())
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  const { mutate: saveCareLog, isPending } = useSaveCareLog()

  // Set default plant when provided
  useEffect(() => {
    if (defaultPlantId && visible) {
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

  const handleSave = () => {
    if (plantIds.length === 0) return

    saveCareLog(
      {
        plantIds,
        type: careType,
        date,
        time,
        notes: notes.trim() || undefined,
        photoUrl: photo ?? undefined,
      },
      {
        onSuccess: () => {
          // Reset form
          setPlantIds(defaultPlantId ? [defaultPlantId] : [])
          setCareType('water')
          setDate(new Date())
          setTime(new Date())
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
      Option.map(formatShortDate),
      Option.getOrElse(() => 'Unknown')
    )

  const formatTimeDisplay = (t: Date) =>
    pipe(
      parseApiDate(t),
      Option.map(formatTime),
      Option.getOrElse(() => 'Unknown')
    )

  const canSave = plantIds.length > 0

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Log Care"
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
        >
          <PlantSelector
            selectedIds={plantIds}
            onSelectionChange={setPlantIds}
            label="Plants"
          />

          <CareTypeChips value={careType} onValueChange={setCareType} />

          {/* Date & Time */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm mb-2 font-medium text-text-primary">
                Date
              </Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="flex-row items-center h-14 px-4 rounded-xl bg-input-bg"
              >
                <MaterialIcons
                  name="calendar-today"
                  size={20}
                  color={iconColors.textMuted}
                />
                <Text className="text-base ml-2 font-regular text-text-primary">
                  {formatDateDisplay(date)}
                </Text>
              </Pressable>
            </View>
            <View className="flex-1">
              <Text className="text-sm mb-2 font-medium text-text-primary">
                Time
              </Text>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                className="flex-row items-center h-14 px-4 rounded-xl bg-input-bg"
              >
                <MaterialIcons
                  name="access-time"
                  size={20}
                  color={iconColors.textMuted}
                />
                <Text className="text-base ml-2 font-regular text-text-primary">
                  {formatTimeDisplay(time)}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Notes */}
          <View className="mb-4">
            <Text className="text-sm mb-2 font-medium text-text-primary">
              Notes (optional)
            </Text>
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes..."
              multiline
              numberOfLines={3}
              style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }}
            />
          </View>

          {/* Photo */}
          <View className="mb-6">
            <Text className="text-sm mb-2 font-medium text-text-primary">
              Photo (optional)
            </Text>
            {photo ? (
              <View className="relative">
                <Image
                  source={{ uri: photo }}
                  className="w-full h-40 rounded-xl"
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => setPhoto(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center"
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
                className="h-32 rounded-xl items-center justify-center border-2 border-dashed border-border active:border-primary active:bg-primary-tint"
              >
                <MaterialIcons
                  name="add-a-photo"
                  size={32}
                  color={iconColors.textMuted}
                />
                <Text className="text-sm mt-2 font-regular text-text-muted">
                  Add photo
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        <View className="pt-4 pb-2">
          <Button onPress={handleSave} disabled={!canSave} loading={isPending}>
            Save Log
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
          onChange={(_event: unknown, selectedDate: Date | undefined) => {
            setShowDatePicker(Platform.OS === 'ios')
            if (selectedDate) {
              setDate(selectedDate)
            }
          }}
        />
      )}

      {/* Time Picker Modal */}
      {showTimePicker && (
        <DateTimePicker
          value={time}
          mode="time"
          display="spinner"
          onChange={(_event: unknown, selectedTime: Date | undefined) => {
            setShowTimePicker(Platform.OS === 'ios')
            if (selectedTime) {
              setTime(selectedTime)
            }
          }}
        />
      )}
    </BottomSheet>
  )
}
