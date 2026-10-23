import { Array as Arr, Match, Option, pipe, Record } from 'effect'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MeshBackground } from '@/components'
import type { OnboardingData, TimeOfDay } from '@/hooks/useOnboardingFlow'
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow'
import { usePlants } from '@/hooks/usePlants'
import { apiEffectRunner } from '@/utils/client'
import { AddPlantStep } from './steps/AddPlantStep'
import { CompletionStep } from './steps/CompletionStep'
import { LocationStep } from './steps/LocationStep'
import { NotificationStep } from './steps/NotificationStep'
import { PreferencesStep, TIME_OF_DAY_TINTS } from './steps/PreferencesStep'
import { RoomsStep } from './steps/RoomsStep'
import { WelcomeStep } from './steps/WelcomeStep'

const TIME_MAP: Record<TimeOfDay, string> = {
  morning: '08:00',
  afternoon: '14:00',
  evening: '19:00',
}

async function savePreferences(data: OnboardingData) {
  try {
    const payload: Record<string, unknown> = {}

    if (data.preferredTime) {
      payload.notifications = {
        preferredNotificationTime: TIME_MAP[data.preferredTime],
      }
    }

    if (data.weatherEnabled && data.latitude && data.longitude) {
      payload.weather = {
        enabled: true,
        latitude: data.latitude,
        longitude: data.longitude,
      }
    }

    if (Record.keys(payload).length > 0) {
      await apiEffectRunner('users', 'updateUserSettings', {
        payload,
      })
    }
  } catch {
    // Non-critical — preferences can be set later in settings
  }
}

// The completion step is the last one and shows no progress bar.
const COMPLETION_STEP = 6
const CARE_TIME_STEP = 5

function StepProgress({
  current,
  total,
  top,
}: {
  current: number
  total: number
  top: number
}) {
  return (
    // Overlays the top instead of pushing the step down, so the mascot sits
    // exactly where it does on the auth and welcome screens.
    <View
      className="absolute left-0 right-0 z-10 flex-row gap-1.5 px-6 pt-3"
      style={{ top }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
    >
      {Arr.map(Arr.range(0, total - 1), (i) => (
        <View
          key={i}
          className={`flex-1 h-1 rounded-full ${i <= current ? 'bg-white' : 'bg-white/20'}`}
        />
      ))}
    </View>
  )
}

export function OnboardingFlowScreen() {
  const { step: devStep } = useLocalSearchParams<{ step?: string }>()
  const insets = useSafeAreaInsets()
  const {
    currentStep,
    data,
    isLoading,
    advance,
    skipStep,
    complete,
    skipOnboarding,
  } = useOnboardingFlow(__DEV__ ? devStep : undefined)

  // The care-time step tints the background with the picked time of day.
  const [pickedTime, setPickedTime] = useState<TimeOfDay | null>(null)
  const meshTint = pipe(
    Option.fromNullishOr(pickedTime),
    Option.filter(() => currentStep === CARE_TIME_STEP),
    Option.map((time) => TIME_OF_DAY_TINTS[time]),
    Option.getOrUndefined
  )

  // Skip onboarding for existing users who already have plants (prod only)
  const { data: plantsData } = usePlants()
  const hasSkippedRef = useRef(false)

  useEffect(() => {
    if (__DEV__ || hasSkippedRef.current || isLoading) return
    if (plantsData && !Arr.isReadonlyArrayEmpty(plantsData.items)) {
      hasSkippedRef.current = true
      skipOnboarding().then(() => router.replace('/(app)/(tabs)'))
    }
  }, [plantsData, isLoading, skipOnboarding])

  const handleComplete = useCallback(async () => {
    const collectedData = await complete(data)
    await savePreferences(collectedData)
    router.replace('/(app)/(tabs)')
  }, [complete, data])

  const handleSkipOnboarding = useCallback(async () => {
    await skipOnboarding()
    router.replace('/(app)/(tabs)')
  }, [skipOnboarding])

  const handleScan = useCallback(() => {
    router.push('/(app)/add-plant/scanner?returnTo=onboarding')
  }, [])

  // Reading the saved step takes a moment; keep the mesh up so the gate's
  // background carries straight into the first step.
  if (isLoading) {
    return (
      <MeshBackground>
        <View className="flex-1" />
      </MeshBackground>
    )
  }

  const stepContent = pipe(
    Match.value(currentStep),
    Match.when(0, () => (
      <WelcomeStep
        onNext={(stepData) => advance(stepData)}
        onSkipOnboarding={handleSkipOnboarding}
      />
    )),
    Match.when(1, () => (
      <AddPlantStep
        onScan={handleScan}
        onPlantAdded={(stepData) => advance(stepData)}
        onSkip={skipStep}
      />
    )),
    Match.when(2, () => (
      <RoomsStep onNext={(stepData) => advance(stepData)} onSkip={skipStep} />
    )),
    Match.when(3, () => (
      <NotificationStep
        data={data}
        onNext={(stepData) => advance(stepData)}
        onSkip={skipStep}
      />
    )),
    Match.when(4, () => (
      <LocationStep
        onNext={(stepData) => advance(stepData)}
        onSkip={skipStep}
      />
    )),
    Match.when(5, () => (
      <PreferencesStep
        onNext={(stepData) => advance(stepData)}
        onSkip={skipStep}
        onSelectTime={setPickedTime}
      />
    )),
    Match.when(6, () => (
      <CompletionStep data={data} onComplete={handleComplete} />
    )),
    Match.orElse(() => (
      <CompletionStep data={data} onComplete={handleComplete} />
    ))
  )

  return (
    <MeshBackground tint={meshTint}>
      {currentStep < COMPLETION_STEP && (
        <StepProgress
          current={currentStep}
          total={COMPLETION_STEP}
          top={insets.top}
        />
      )}
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        <Animated.View
          key={currentStep}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(150)}
          className="flex-1"
        >
          {stepContent}
        </Animated.View>
      </View>
    </MeshBackground>
  )
}
