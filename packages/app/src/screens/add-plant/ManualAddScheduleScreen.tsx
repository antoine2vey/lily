import { MaterialIcons } from '@expo/vector-icons'
import { Either, Match, Option, pipe } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FormTextArea } from 'src/components'
import { Button } from 'src/components/ui/Button'
import { useCreatePlant } from 'src/hooks/useCreatePlant'
import { useIconColors } from 'src/hooks/useIconColors'
import { FrequencyPicker } from 'src/screens/add-plant/components/FrequencyPicker'
import { WizardHeader } from 'src/screens/add-plant/components/WizardHeader'
import { RoomPicker } from 'src/screens/rooms/components/RoomPicker'

type BasicInfo = {
  photo: string | null
  name: string
  category: string
}

type CareNeeds = {
  watering: number
  luxNeeded: number
  humidity: number
  petSafe: boolean
}

const DEFAULT_BASIC_INFO: BasicInfo = { photo: null, name: '', category: '' }
const DEFAULT_CARE_NEEDS: CareNeeds = {
  watering: 50,
  luxNeeded: 2000,
  humidity: 50,
  petSafe: false,
}

function safeDecodeParam<T>(encoded: string | undefined, fallback: T): T {
  if (!encoded) return fallback
  try {
    return JSON.parse(decodeURIComponent(encoded)) as T
  } catch {
    return fallback
  }
}

export function ManualAddScheduleScreen() {
  const { t } = useTranslation(['addPlant', 'common'])
  const params = useLocalSearchParams<{
    basicInfo?: string
    careNeeds?: string
    prefillData?: string
  }>()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()

  const WATERING_PRESETS = [
    { days: 7, label: t('addPlant:schedule.presets.sevenDays') },
    { days: 3, label: t('addPlant:schedule.presets.threeDays') },
    { days: 14, label: t('addPlant:schedule.presets.fourteenDays') },
    { days: 30, label: t('addPlant:schedule.presets.thirtyDays') },
  ]

  const FERTILIZING_PRESETS = [
    { days: 14, label: t('addPlant:schedule.presets.fourteenDays') },
    { days: 30, label: t('addPlant:schedule.presets.thirtyDays') },
    { days: 60, label: t('addPlant:schedule.presets.sixtyDays') },
  ]
  const basicInfo = safeDecodeParam<BasicInfo>(
    params.basicInfo,
    DEFAULT_BASIC_INFO
  )
  const careNeeds = safeDecodeParam<CareNeeds>(
    params.careNeeds,
    DEFAULT_CARE_NEEDS
  )
  const prefill = safeDecodeParam<Record<string, unknown> | null>(
    params.prefillData,
    null
  )

  const [roomId, setRoomId] = useState<string | null>(null)
  const [wateringDays, setWateringDays] = useState(
    pipe(
      Option.fromNullable(prefill),
      Option.flatMap((p) =>
        Option.fromNullable(p.wateringFrequencyDays as number)
      ),
      Option.getOrElse(() => 7)
    )
  )
  const [fertilizingDays, setFertilizingDays] = useState(
    pipe(
      Option.fromNullable(prefill),
      Option.flatMap((p) =>
        Option.fromNullable(p.fertilizationFrequencyDays as number)
      ),
      Option.getOrElse(() => 30)
    )
  )
  const [careReminders, setCareReminders] = useState(true)
  const [notes, setNotes] = useState(
    pipe(
      Option.fromNullable(prefill),
      Option.flatMap((p) => Option.fromNullable(p.description as string)),
      Option.getOrElse(() => '')
    )
  )

  const { mutate: createPlant, isPending } = useCreatePlant()

  const handleFinish = () => {
    createPlant(
      {
        payload: {
          name: basicInfo.name,
          category: basicInfo.category || undefined,
          description: notes || undefined,
          wateringFrequencyDays: wateringDays,
          fertilizationFrequencyDays: fertilizingDays,
          luxNeeded: careNeeds.luxNeeded,
          humidityRating: careNeeds.humidity,
          petToxicityRating: careNeeds.petSafe ? 0 : 100,
          remindersEnabled: careReminders,
          roomId: roomId || undefined,
        },
      },
      {
        onSuccess: (apiResult) => {
          pipe(
            apiResult,
            Either.match({
              onLeft: (error) =>
                pipe(
                  Match.value(error),
                  Match.when({ _tag: 'LimitExceededError' }, (e) =>
                    Alert.alert(
                      t('addPlant:scanner.plantLimitReached'),
                      e.message
                    )
                  ),
                  Match.orElse(() =>
                    Alert.alert(
                      t('common:errors.generic'),
                      t('addPlant:errors.createFailed')
                    )
                  )
                ),
              onRight: (plant) => {
                router.dismissAll()
                router.push(`/plant/${plant.id}`)
              },
            })
          )
        },
      }
    )
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <WizardHeader
        step={3}
        totalSteps={3}
        onBack={() => router.back()}
        title={t('addPlant:schedule.title')}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 p-6"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 32, paddingBottom: 120 }}
        >
          {/* Watering Section */}
          <FrequencyPicker
            icon={<MaterialIcons name="water-drop" size={22} color="#60A5FA" />}
            label={t('addPlant:schedule.watering')}
            value={wateringDays}
            onValueChange={setWateringDays}
            presets={WATERING_PRESETS}
          />

          {/* Fertilizing Section */}
          <FrequencyPicker
            icon={<MaterialIcons name="spa" size={22} color="#F59E0B" />}
            label={t('addPlant:schedule.fertilizing')}
            value={fertilizingDays}
            onValueChange={setFertilizingDays}
            presets={FERTILIZING_PRESETS}
          />

          {/* Reminders Toggle */}
          <View className="bg-white dark:bg-surface-dark p-4 px-5 rounded-xl shadow-sm border border-border dark:border-slate-700 flex-row items-center justify-between">
            <View>
              <Text className="text-base font-bold text-text-primary dark:text-white">
                {t('addPlant:schedule.careReminders')}
              </Text>
              <Text className="text-xs text-text-muted dark:text-slate-400 mt-1">
                {t('addPlant:schedule.careRemindersDescription')}
              </Text>
            </View>
            <Switch
              value={careReminders}
              onValueChange={setCareReminders}
              trackColor={{
                false: iconColors.border,
                true: iconColors.primary,
              }}
              thumbColor={iconColors.white}
              ios_backgroundColor={iconColors.border}
            />
          </View>

          {/* Room Selection */}
          <View className="gap-2">
            <Text className="text-base pl-1 font-semibold text-text-primary dark:text-white">
              {t('addPlant:schedule.roomLabel')}
            </Text>
            <RoomPicker
              value={roomId}
              onSelect={setRoomId}
              plantLuxNeeded={careNeeds.luxNeeded}
            />
          </View>

          {/* Notes Section */}
          <FormTextArea
            label={t('addPlant:schedule.notesLabel')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('addPlant:schedule.notesPlaceholder')}
          />
        </ScrollView>

        {/* Footer */}
        <View
          className="px-4 pt-4 bg-background dark:bg-background-dark"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Button
            onPress={handleFinish}
            loading={isPending}
            pill
            icon="check"
            iconPosition="left"
          >
            {t('addPlant:schedule.finishButton')}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
