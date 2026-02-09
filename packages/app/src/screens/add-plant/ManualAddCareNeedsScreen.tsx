import { MaterialIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Slider } from 'src/components/Slider'
import { ToggleRow } from 'src/components/ToggleRow'
import { Button } from 'src/components/ui/Button'
import { useIconColors } from 'src/hooks/useIconColors'
import { WizardHeader } from 'src/screens/add-plant/components/WizardHeader'

type BasicInfo = {
  photo: string | null
  name: string
  category: string
}

export function ManualAddCareNeedsScreen() {
  const { t } = useTranslation('addPlant')
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
            {t('careNeeds.title')}
          </Text>
          <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
            {t('careNeeds.description')}
          </Text>
        </View>

        {/* Sliders */}
        <View className="gap-8">
          <Slider
            icon={<MaterialIcons name="water-drop" size={20} color="#2563EB" />}
            iconBgColor="#DBEAFE"
            label={t('careNeeds.watering.label')}
            value={watering}
            onValueChange={setWatering}
            min={0}
            max={100}
            minLabel={t('careNeeds.watering.low')}
            maxLabel={t('careNeeds.watering.high')}
          />

          <Slider
            icon={<MaterialIcons name="wb-sunny" size={20} color="#CA8A04" />}
            iconBgColor="#FEF9C3"
            label={t('careNeeds.light.label')}
            value={light}
            onValueChange={setLight}
            min={0}
            max={100}
            minLabel={t('careNeeds.light.low')}
            maxLabel={t('careNeeds.light.high')}
          />

          <Slider
            icon={<MaterialIcons name="water" size={20} color="#0D9488" />}
            iconBgColor="#CCFBF1"
            label={t('careNeeds.humidity.label')}
            value={humidity}
            onValueChange={setHumidity}
            min={0}
            max={100}
            minLabel={t('careNeeds.humidity.low')}
            maxLabel={t('careNeeds.humidity.high')}
          />

          {/* Divider */}
          <View className="h-px w-full bg-surface-tinted dark:bg-slate-700" />

          {/* Pet Safety Toggle */}
          <ToggleRow
            icon={
              <MaterialIcons name="pets" size={20} color={iconColors.primary} />
            }
            label={t('careNeeds.petSafety.label')}
            description={t('careNeeds.petSafety.question')}
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
            {t('buttons.back')}
          </Button>
        </View>
        <View style={{ flex: 2 }}>
          <Button onPress={handleNext} pill>
            {t('buttons.nextStep')}
          </Button>
        </View>
      </View>
    </View>
  )
}
