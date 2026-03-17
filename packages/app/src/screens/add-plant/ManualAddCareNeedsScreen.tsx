import { MaterialIcons } from '@expo/vector-icons'
import {
  LUMINOSITY_LEVELS,
  LUMINOSITY_LUX_VALUES,
  type LuminosityLevel,
  luxToLuminosityLevel,
  luxToSliderValue,
} from '@lily/shared'
import { Array, String as EffectString, Match, Option, pipe } from 'effect'
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

const DEFAULT_BASIC_INFO: BasicInfo = { photo: null, name: '', category: '' }

function safeDecodeParam<T>(encoded: string | undefined, fallback: T): T {
  if (!encoded) return fallback
  try {
    return JSON.parse(decodeURIComponent(encoded)) as T
  } catch {
    return fallback
  }
}

export function ManualAddCareNeedsScreen() {
  const { t } = useTranslation(['addPlant', 'rooms'])
  const params = useLocalSearchParams<{
    basicInfo?: string
    prefillData?: string
  }>()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const basicInfo = safeDecodeParam<BasicInfo>(
    params.basicInfo,
    DEFAULT_BASIC_INFO
  )
  const prefill = safeDecodeParam<Record<string, unknown> | null>(
    params.prefillData,
    null
  )

  console.log('[DEBUG CareNeeds] raw params.prefillData:', params.prefillData)
  console.log(
    '[DEBUG CareNeeds] decoded prefill:',
    JSON.stringify(prefill, null, 2)
  )

  const [watering, setWatering] = useState(50)
  const [light, setLight] = useState(
    pipe(
      Option.fromNullable(prefill),
      Option.flatMap((p) => Option.fromNullable(p.luxNeeded as number)),
      Option.map(luxToSliderValue),
      Option.getOrElse(() => 50)
    )
  )
  const [humidity, setHumidity] = useState(
    pipe(
      Option.fromNullable(prefill),
      Option.flatMap((p) => Option.fromNullable(p.humidityRating as number)),
      Option.getOrElse(() => 50)
    )
  )
  const [petSafe, setPetSafe] = useState(
    pipe(
      Option.fromNullable(prefill),
      Option.flatMap((p) => Option.fromNullable(p.petToxicityRating as number)),
      Option.map((rating) => rating <= 50),
      Option.getOrElse(() => false)
    )
  )

  const sliderToLux = (v: number): number =>
    pipe(
      Match.value(v),
      Match.when(
        (s) => s < 20,
        () => LUMINOSITY_LUX_VALUES[1]
      ),
      Match.when(
        (s) => s < 40,
        () => LUMINOSITY_LUX_VALUES[2]
      ),
      Match.when(
        (s) => s < 60,
        () => LUMINOSITY_LUX_VALUES[3]
      ),
      Match.when(
        (s) => s < 80,
        () => LUMINOSITY_LUX_VALUES[4]
      ),
      Match.orElse(() => LUMINOSITY_LUX_VALUES[5])
    )

  const STEPS: LuminosityLevel[] = [1, 2, 3, 4, 5]

  const sliderToStep = (v: number): LuminosityLevel =>
    pipe(
      Match.value(v),
      Match.when(
        (s) => s < 20,
        () => 1 as const
      ),
      Match.when(
        (s) => s < 40,
        () => 2 as const
      ),
      Match.when(
        (s) => s < 60,
        () => 3 as const
      ),
      Match.when(
        (s) => s < 80,
        () => 4 as const
      ),
      Match.orElse(() => 5 as const)
    )

  const activeWateringLevel = sliderToStep(watering)
  const activeLevel = luxToLuminosityLevel(sliderToLux(light))
  const activeHumidityLevel = sliderToStep(humidity)

  const handleNext = () => {
    const luxNeeded = sliderToLux(light)
    const careNeeds = encodeURIComponent(
      JSON.stringify({ watering, luxNeeded, humidity, petSafe })
    )
    const basicInfoParam = encodeURIComponent(JSON.stringify(basicInfo))
    const prefillParam = params.prefillData
      ? `&prefillData=${encodeURIComponent(params.prefillData)}`
      : ''
    router.push(
      `/add-plant/manual-schedule?basicInfo=${basicInfoParam}&careNeeds=${careNeeds}${prefillParam}`
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
          <View className="gap-2">
            <Slider
              icon={
                <MaterialIcons name="water-drop" size={20} color="#2563EB" />
              }
              iconBgColor="#DBEAFE"
              label={t('addPlant:careNeeds.watering.label')}
              value={watering}
              onValueChange={setWatering}
              min={0}
              max={100}
            />
            <View className="flex-row justify-between">
              {Array.map(STEPS, (step) => {
                const isActive = step === activeWateringLevel
                const parts = EffectString.split(
                  t(`addPlant:careNeeds.watering.levels.${step}`),
                  '\n'
                )
                return (
                  <View key={step} className="items-center flex-1">
                    <Text
                      className={`text-base ${isActive ? '' : 'opacity-30'}`}
                    >
                      {parts[0]}
                    </Text>
                    <Text
                      className={`text-[9px] text-center mt-0.5 ${
                        isActive
                          ? 'text-primary font-semibold'
                          : 'text-text-muted dark:text-slate-400'
                      }`}
                    >
                      {parts[1]}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>

          <View className="gap-2">
            <Slider
              icon={<MaterialIcons name="wb-sunny" size={20} color="#CA8A04" />}
              iconBgColor="#FEF9C3"
              label={t('addPlant:careNeeds.light.label')}
              value={light}
              onValueChange={setLight}
              min={0}
              max={100}
            />
            <View className="flex-row justify-between">
              {Array.map(STEPS, (level) => {
                const isActive = level === activeLevel
                const info = LUMINOSITY_LEVELS[level]
                return (
                  <View key={level} className="items-center flex-1">
                    <Text
                      className={`text-base ${isActive ? '' : 'opacity-30'}`}
                    >
                      {info.icon}
                    </Text>
                    <Text
                      className={`text-[9px] text-center mt-0.5 ${
                        isActive
                          ? 'text-primary font-semibold'
                          : 'text-text-muted dark:text-slate-400'
                      }`}
                    >
                      {t(`rooms:lightingLevels.${level}`)}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>

          <View className="gap-2">
            <Slider
              icon={<MaterialIcons name="water" size={20} color="#0D9488" />}
              iconBgColor="#CCFBF1"
              label={t('addPlant:careNeeds.humidity.label')}
              value={humidity}
              onValueChange={setHumidity}
              min={0}
              max={100}
            />
            <View className="flex-row justify-between">
              {Array.map(STEPS, (step) => {
                const isActive = step === activeHumidityLevel
                const parts = EffectString.split(
                  t(`addPlant:careNeeds.humidity.levels.${step}`),
                  '\n'
                )
                return (
                  <View key={step} className="items-center flex-1">
                    <Text
                      className={`text-base ${isActive ? '' : 'opacity-30'}`}
                    >
                      {parts[0]}
                    </Text>
                    <Text
                      className={`text-[9px] text-center mt-0.5 ${
                        isActive
                          ? 'text-primary font-semibold'
                          : 'text-text-muted dark:text-slate-400'
                      }`}
                    >
                      {parts[1]}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>

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
