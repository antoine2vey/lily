import { MaterialIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
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
import { ApiError } from 'src/utils/client'
import { FrequencyPicker } from './components/FrequencyPicker'
import { WizardHeader } from './components/WizardHeader'

type BasicInfo = {
  photo: string | null
  name: string
  category: string
}

type CareNeeds = {
  watering: number
  light: number
  humidity: number
  petSafe: boolean
}

const WATERING_PRESETS = [
  { days: 7, label: '7 days' },
  { days: 3, label: '3 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
]

const FERTILIZING_PRESETS = [
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
]

export function ManualAddScheduleScreen() {
  const params = useLocalSearchParams<{
    basicInfo?: string
    careNeeds?: string
  }>()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const basicInfo: BasicInfo = params.basicInfo
    ? JSON.parse(decodeURIComponent(params.basicInfo))
    : { photo: null, name: '', category: '' }
  const careNeeds: CareNeeds = params.careNeeds
    ? JSON.parse(decodeURIComponent(params.careNeeds))
    : { watering: 50, light: 50, humidity: 50, petSafe: false }

  const [wateringDays, setWateringDays] = useState(7)
  const [fertilizingDays, setFertilizingDays] = useState(30)
  const [careReminders, setCareReminders] = useState(true)
  const [notes, setNotes] = useState('')

  const { mutate: createPlant, isPending } = useCreatePlant()

  const handleFinish = () => {
    // Convert light slider value (0-100) to sunlight preference string
    const sunlightPreference =
      careNeeds.light < 33 ? 'low' : careNeeds.light < 66 ? 'medium' : 'high'

    createPlant(
      {
        payload: {
          name: basicInfo.name,
          category: basicInfo.category || undefined,
          description: notes || undefined,
          wateringFrequencyDays: wateringDays,
          fertilizationFrequencyDays: fertilizingDays,
          sunlightPreference,
          humidityRating: careNeeds.humidity,
          petToxicityRating: careNeeds.petSafe ? 0 : 100,
          remindersEnabled: careReminders,
        },
      },
      {
        onSuccess: (plant) => {
          router.dismissAll()
          router.push(`/plant/${plant.id}`)
        },
        onError: (error) => {
          if (
            error instanceof ApiError &&
            error._tag === 'LimitExceededError'
          ) {
            Alert.alert('Plant Limit Reached', error.message)
            return
          }

          Alert.alert('Error', 'Failed to create plant. Please try again.')
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
        title="Set Schedule"
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
            label="Watering Schedule"
            value={wateringDays}
            onValueChange={setWateringDays}
            presets={WATERING_PRESETS}
          />

          {/* Fertilizing Section */}
          <FrequencyPicker
            icon={<MaterialIcons name="spa" size={22} color="#F59E0B" />}
            label="Fertilizing Schedule"
            value={fertilizingDays}
            onValueChange={setFertilizingDays}
            presets={FERTILIZING_PRESETS}
          />

          {/* Reminders Toggle */}
          <View className="bg-white dark:bg-surface-dark p-4 px-5 rounded-xl shadow-sm border border-border dark:border-slate-700 flex-row items-center justify-between">
            <View>
              <Text className="text-base font-bold text-text-primary dark:text-white">
                Care Reminders
              </Text>
              <Text className="text-xs text-text-muted dark:text-slate-400 mt-1">
                Get notified when tasks are due
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

          {/* Notes Section */}
          <FormTextArea
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add care tips or specific needs..."
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
            Finish & Add Plant
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
