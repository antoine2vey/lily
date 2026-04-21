import { MaterialIcons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { Array, Either, Match, Option, pipe } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
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
import { toast } from 'sonner-native'
import { FormTextArea } from '@/components'
import { Button } from '@/components/ui/Button'
import { useCreatePlant } from '@/hooks/useCreatePlant'
import { useIconColors } from '@/hooks/useIconColors'
import { plantDetailKey, useUpdatePlant } from '@/hooks/useUpdatePlant'
import { FrequencyPicker } from '@/screens/add-plant/components/FrequencyPicker'
import { WizardHeader } from '@/screens/add-plant/components/WizardHeader'
import { RoomPicker } from '@/screens/rooms/components/RoomPicker'
import { isLocalFileUri } from '@/utils/upload'

type BasicInfo = {
  photo: string | null
  name: string
  category: string
}

type CareNeeds = {
  watering: number
  light: number
  luxNeeded: number
  humidity: number
  petSafe: boolean
}

const DEFAULT_BASIC_INFO: BasicInfo = { photo: null, name: '', category: '' }
const DEFAULT_CARE_NEEDS: CareNeeds = {
  watering: 50,
  light: 50,
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

  const WATERING_PRESETS = useMemo(
    () => [
      { days: 7, label: t('addPlant:schedule.presets.sevenDays') },
      { days: 3, label: t('addPlant:schedule.presets.threeDays') },
      { days: 14, label: t('addPlant:schedule.presets.fourteenDays') },
      { days: 30, label: t('addPlant:schedule.presets.thirtyDays') },
    ],
    [t]
  )

  const FERTILIZING_PRESETS = useMemo(
    () => [
      { days: 14, label: t('addPlant:schedule.presets.fourteenDays') },
      { days: 30, label: t('addPlant:schedule.presets.thirtyDays') },
      { days: 60, label: t('addPlant:schedule.presets.sixtyDays') },
    ],
    [t]
  )

  const MISTING_PRESETS = useMemo(
    () => [
      { days: 1, label: t('addPlant:schedule.presets.daily') },
      { days: 2, label: t('addPlant:schedule.presets.twoDays') },
      { days: 3, label: t('addPlant:schedule.presets.threeDays') },
      { days: 7, label: t('addPlant:schedule.presets.sevenDays') },
    ],
    [t]
  )

  const REPOTTING_PRESETS = useMemo(
    () => [
      { days: 180, label: t('addPlant:schedule.presets.sixMonths') },
      { days: 365, label: t('addPlant:schedule.presets.oneYear') },
      { days: 730, label: t('addPlant:schedule.presets.twoYears') },
    ],
    [t]
  )
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
  const prefillFertilization = pipe(
    Option.fromNullable(prefill),
    Option.flatMap((p) =>
      Option.fromNullable(p.fertilizationFrequencyDays as number | null)
    )
  )
  const [fertilizingEnabled, setFertilizingEnabled] = useState(
    Option.isSome(prefillFertilization)
  )
  const [fertilizingDays, setFertilizingDays] = useState(
    Option.getOrElse(prefillFertilization, () => 30)
  )
  const prefillMisting = pipe(
    Option.fromNullable(prefill),
    Option.flatMap((p) =>
      Option.fromNullable(p.mistingFrequencyDays as number | null)
    )
  )
  const prefillRepotting = pipe(
    Option.fromNullable(prefill),
    Option.flatMap((p) =>
      Option.fromNullable(p.repottingFrequencyDays as number | null)
    )
  )
  const [mistingEnabled, setMistingEnabled] = useState(
    Option.isSome(prefillMisting)
  )
  const [mistingDays, setMistingDays] = useState(
    Option.getOrElse(prefillMisting, () => 2)
  )
  const [repottingEnabled, setRepottingEnabled] = useState(
    Option.isSome(prefillRepotting)
  )
  const [repottingDays, setRepottingDays] = useState(
    Option.getOrElse(prefillRepotting, () => 365)
  )
  const [careReminders, setCareReminders] = useState(true)
  const [notes, setNotes] = useState(
    pipe(
      Option.fromNullable(prefill),
      Option.map((p) =>
        Array.filterMap(
          [p.description as string | null, p.wateringTips as string | null],
          Option.fromNullable
        )
      ),
      Option.map((parts) => Array.join(parts, '\n')),
      Option.getOrElse(() => '')
    )
  )

  const queryClient = useQueryClient()
  const { mutateAsync: createPlantAsync, isPending } = useCreatePlant()
  const { mutate: updatePlant } = useUpdatePlant()

  const handleFinish = async () => {
    const apiResult = await createPlantAsync({
      payload: {
        name: basicInfo.name,
        category: basicInfo.category || undefined,
        description: notes || undefined,
        wateringFrequencyDays: wateringDays,
        fertilizationFrequencyDays: fertilizingEnabled
          ? fertilizingDays
          : undefined,
        mistingFrequencyDays: mistingEnabled ? mistingDays : undefined,
        repottingFrequencyDays: repottingEnabled ? repottingDays : undefined,
        luxNeeded: careNeeds.luxNeeded,
        lightingRating: careNeeds.light,
        humidityRating: careNeeds.humidity,
        petToxicityRating: careNeeds.petSafe ? 0 : 100,
        wateringRating: careNeeds.watering,
        remindersEnabled: careReminders,
        roomId: roomId || undefined,
      },
    })

    if (Either.isLeft(apiResult)) {
      pipe(
        Match.value(apiResult.left),
        Match.when({ _tag: 'LimitExceededError' }, (e) =>
          Alert.alert(t('addPlant:scanner.plantLimitReached'), e.message)
        ),
        Match.orElse(() =>
          Alert.alert(
            t('common:errors.generic'),
            t('addPlant:errors.createFailed')
          )
        )
      )
      return
    }

    const plant = apiResult.right

    if (isLocalFileUri(basicInfo.photo)) {
      // Seed the detail cache so the local file:// photo renders instantly on
      // the next screen; the background upload's onSettled will refetch and
      // swap in the GCS URL without the user noticing.
      queryClient.setQueryData(
        plantDetailKey(plant.id),
        Either.right({ ...plant, imageUrl: basicInfo.photo, photos: [] })
      )
      updatePlant(
        {
          path: { id: plant.id },
          payload: { imageUrl: basicInfo.photo },
        },
        {
          onError: (err) => {
            console.error('[ManualAddSchedule] photo upload failed', err)
            toast.error(t('addPlant:errors.photoUploadFailed'))
          },
        }
      )
    }

    router.dismissAll()
    router.push(`/plant/${plant.id}`)
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
          <View className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="spa" size={22} color="#F59E0B" />
                <Text className="text-lg font-bold text-text-primary dark:text-white">
                  {t('addPlant:schedule.fertilizing')}
                </Text>
              </View>
              <Switch
                value={fertilizingEnabled}
                onValueChange={setFertilizingEnabled}
                trackColor={{
                  false: iconColors.border,
                  true: iconColors.primary,
                }}
                thumbColor={iconColors.white}
                ios_backgroundColor={iconColors.border}
              />
            </View>
            {fertilizingEnabled ? (
              <FrequencyPicker
                label=""
                value={fertilizingDays}
                onValueChange={setFertilizingDays}
                presets={FERTILIZING_PRESETS}
              />
            ) : (
              <View className="bg-surface-tinted dark:bg-slate-800 p-4 rounded-xl">
                <Text className="text-sm text-text-muted dark:text-slate-400 text-center">
                  {t('addPlant:schedule.enableFertilizing')}
                </Text>
              </View>
            )}
          </View>

          {/* Misting Section */}
          <View className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <MaterialIcons
                  name="grain"
                  size={22}
                  color={iconColors.mistTeal}
                />
                <Text className="text-lg font-bold text-text-primary dark:text-white">
                  {t('addPlant:schedule.misting')}
                </Text>
              </View>
              <Switch
                value={mistingEnabled}
                onValueChange={setMistingEnabled}
                trackColor={{
                  false: iconColors.border,
                  true: iconColors.primary,
                }}
                thumbColor={iconColors.white}
                ios_backgroundColor={iconColors.border}
              />
            </View>
            {mistingEnabled ? (
              <FrequencyPicker
                label=""
                value={mistingDays}
                onValueChange={setMistingDays}
                presets={MISTING_PRESETS}
              />
            ) : (
              <View className="bg-surface-tinted dark:bg-slate-800 p-4 rounded-xl">
                <Text className="text-sm text-text-muted dark:text-slate-400 text-center">
                  {t('addPlant:schedule.enableMisting')}
                </Text>
              </View>
            )}
          </View>

          {/* Repotting Section */}
          <View className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <MaterialIcons
                  name="yard"
                  size={22}
                  color={iconColors.repotBrown}
                />
                <Text className="text-lg font-bold text-text-primary dark:text-white">
                  {t('addPlant:schedule.repotting')}
                </Text>
              </View>
              <Switch
                value={repottingEnabled}
                onValueChange={setRepottingEnabled}
                trackColor={{
                  false: iconColors.border,
                  true: iconColors.primary,
                }}
                thumbColor={iconColors.white}
                ios_backgroundColor={iconColors.border}
              />
            </View>
            {repottingEnabled ? (
              <FrequencyPicker
                label=""
                value={repottingDays}
                onValueChange={setRepottingDays}
                presets={REPOTTING_PRESETS}
              />
            ) : (
              <View className="bg-surface-tinted dark:bg-slate-800 p-4 rounded-xl">
                <Text className="text-sm text-text-muted dark:text-slate-400 text-center">
                  {t('addPlant:schedule.enableRepotting')}
                </Text>
              </View>
            )}
          </View>

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
