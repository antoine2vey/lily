import { MaterialIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Slider } from 'src/components/Slider'
import { ToggleRow } from 'src/components/ToggleRow'
import { Button } from 'src/components/ui/Button'
import { iconColors } from 'src/theme'
import { WizardHeader } from './components/WizardHeader'

type BasicInfo = {
  photo: string | null
  name: string
  category: string
}

export function ManualAddCareNeedsScreen() {
  const params = useLocalSearchParams<{ basicInfo?: string }>()
  const basicInfo: BasicInfo = params.basicInfo
    ? JSON.parse(decodeURIComponent(params.basicInfo))
    : { photo: null, name: '', category: '' }

  const [watering, setWatering] = useState(50)
  const [light, setLight] = useState(50)
  const [humidity, setHumidity] = useState(50)
  const [petSafe, setPetSafe] = useState(false)

  const handleNext = () => {
    const careNeeds = encodeURIComponent(
      JSON.stringify({ watering, light, humidity, petSafe })
    )
    const basicInfoParam = encodeURIComponent(JSON.stringify(basicInfo))
    router.push(
      `/add-plant/manual-schedule?basicInfo=${basicInfoParam}&careNeeds=${careNeeds}`
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <WizardHeader step={2} totalSteps={3} onBack={() => router.back()} />

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        <Text className="text-2xl mb-2 mt-4 font-bold text-text-primary">
          Care Needs
        </Text>
        <Text className="text-base mb-6 font-regular text-text-secondary">
          Define the ideal environment for your plant.
        </Text>

        <View className="mb-6">
          <Slider
            icon={
              <MaterialIcons
                name="water-drop"
                size={18}
                color={iconColors.primary}
              />
            }
            label="Watering"
            value={watering}
            onValueChange={setWatering}
            min={0}
            max={100}
            minLabel="Drought tolerant"
            maxLabel="Loves water"
          />
        </View>

        <View className="mb-6">
          <Slider
            icon={
              <MaterialIcons
                name="wb-sunny"
                size={18}
                color={iconColors.primary}
              />
            }
            label="Light"
            value={light}
            onValueChange={setLight}
            min={0}
            max={100}
            minLabel="Low light"
            maxLabel="Direct sun"
          />
        </View>

        <View className="mb-6">
          <Slider
            icon={
              <MaterialIcons
                name="cloud"
                size={18}
                color={iconColors.primary}
              />
            }
            label="Humidity"
            value={humidity}
            onValueChange={setHumidity}
            min={0}
            max={100}
            minLabel="Dry air OK"
            maxLabel="High humidity"
          />
        </View>

        <View className="py-2">
          <ToggleRow
            icon={
              <MaterialIcons name="pets" size={18} color={iconColors.primary} />
            }
            label="Pet Safe"
            description="Is this plant safe for pets?"
            value={petSafe}
            onValueChange={setPetSafe}
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
          <Button onPress={handleNext}>Next Step</Button>
        </View>
      </View>
    </SafeAreaView>
  )
}
