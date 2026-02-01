import { MaterialIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Slider } from 'src/components/Slider'
import { ToggleRow } from 'src/components/ToggleRow'
import { Button } from 'src/components/ui/Button'
import { useIconColors } from 'src/hooks/useIconColors'
import { WizardHeader } from './components/WizardHeader'

type BasicInfo = {
  photo: string | null
  name: string
  category: string
}

export function ManualAddCareNeedsScreen() {
  const params = useLocalSearchParams<{ basicInfo?: string }>()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
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
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <WizardHeader step={2} totalSteps={3} onBack={() => router.back()} />

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Headline */}
        <View className="gap-1 py-4">
          <Text className="text-2xl font-bold text-text-primary dark:text-white">
            Care Needs
          </Text>
          <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
            Define the ideal environment for your plant.
          </Text>
        </View>

        {/* Sliders */}
        <View className="gap-8">
          <Slider
            icon={<MaterialIcons name="water-drop" size={20} color="#2563EB" />}
            iconBgColor="#DBEAFE"
            label="Watering"
            value={watering}
            onValueChange={setWatering}
            min={0}
            max={100}
            minLabel="Drought tolerant"
            maxLabel="Loves water"
          />

          <Slider
            icon={<MaterialIcons name="wb-sunny" size={20} color="#CA8A04" />}
            iconBgColor="#FEF9C3"
            label="Light"
            value={light}
            onValueChange={setLight}
            min={0}
            max={100}
            minLabel="Low light"
            maxLabel="Direct sun"
          />

          <Slider
            icon={<MaterialIcons name="water" size={20} color="#0D9488" />}
            iconBgColor="#CCFBF1"
            label="Humidity"
            value={humidity}
            onValueChange={setHumidity}
            min={0}
            max={100}
            minLabel="Dry air OK"
            maxLabel="High humidity"
          />

          {/* Divider */}
          <View className="h-px w-full bg-surface-tinted dark:bg-slate-700" />

          {/* Pet Safety Toggle */}
          <ToggleRow
            icon={
              <MaterialIcons name="pets" size={20} color={iconColors.primary} />
            }
            label="Pet Safety"
            description="Is this plant toxic to pets?"
            value={petSafe}
            onValueChange={setPetSafe}
          />
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View
        className="flex-row gap-4 px-6 pt-4 bg-background dark:bg-background-dark border-t border-surface-tinted dark:border-slate-700"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <View className="flex-1">
          <Button variant="secondary" onPress={() => router.back()} pill>
            Back
          </Button>
        </View>
        <View style={{ flex: 2 }}>
          <Button onPress={handleNext} pill>
            Next Step
          </Button>
        </View>
      </View>
    </View>
  )
}
