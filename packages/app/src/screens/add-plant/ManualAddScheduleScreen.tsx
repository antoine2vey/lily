import { MaterialIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ToggleRow } from 'src/components/ToggleRow'
import { Button } from 'src/components/ui/Button'
import { Input } from 'src/components/ui/Input'
import { useCreatePlant } from 'src/hooks/useCreatePlant'
import { iconColors } from 'src/theme'
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
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
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
    <SafeAreaView className="flex-1 bg-background">
      <WizardHeader step={3} totalSteps={3} onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-2xl mb-2 mt-4 font-bold text-text-primary">
            Schedule
          </Text>
          <Text className="text-base mb-6 font-regular text-text-secondary">
            Set up care reminders for your plant.
          </Text>

          <FrequencyPicker
            icon={
              <MaterialIcons
                name="water-drop"
                size={16}
                color={iconColors.primary}
              />
            }
            label="Watering Schedule"
            value={wateringDays}
            onValueChange={setWateringDays}
            presets={WATERING_PRESETS}
          />

          <FrequencyPicker
            icon={
              <MaterialIcons name="eco" size={16} color={iconColors.primary} />
            }
            label="Fertilizing Schedule"
            value={fertilizingDays}
            onValueChange={setFertilizingDays}
            presets={FERTILIZING_PRESETS}
          />

          <View className="py-2 mb-4">
            <ToggleRow
              icon={
                <MaterialIcons
                  name="notifications"
                  size={18}
                  color={iconColors.primary}
                />
              }
              label="Care Reminders"
              description="Get notified when tasks are due"
              value={careReminders}
              onValueChange={setCareReminders}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm mb-2 font-medium text-text-primary">
              Notes
            </Text>
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="Add care tips or specific needs..."
              multiline
              numberOfLines={4}
              style={{ height: 100, textAlignVertical: 'top', paddingTop: 12 }}
            />
          </View>
        </ScrollView>

        <View className="flex-row gap-3 px-6 py-4 bg-background">
          <View className="flex-1">
            <Button variant="secondary" onPress={() => router.back()}>
              Back
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={handleFinish} loading={isPending} icon="check">
              Finish
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
