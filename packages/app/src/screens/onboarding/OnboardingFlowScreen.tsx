import { Array as Arr, Match, pipe, Record } from 'effect'
import { router } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { OnboardingData, TimeOfDay } from '@/hooks/useOnboardingFlow'
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow'
import { usePlants } from '@/hooks/usePlants'
import { apiEffectRunner } from '@/utils/client'
import { AddPlantStep } from './steps/AddPlantStep'
import { CompletionStep } from './steps/CompletionStep'
import { LocationStep } from './steps/LocationStep'
import { NotificationStep } from './steps/NotificationStep'
import { PreferencesStep } from './steps/PreferencesStep'
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

export function OnboardingFlowScreen() {
  const insets = useSafeAreaInsets()
  const {
    currentStep,
    data,
    isLoading,
    advance,
    skipStep,
    complete,
    skipOnboarding,
  } = useOnboardingFlow()

  // Skip onboarding for existing users who already have plants
  const { data: plantsData } = usePlants()
  const hasSkippedRef = useRef(false)

  useEffect(() => {
    if (hasSkippedRef.current || isLoading) return
    if (plantsData && !Arr.isEmptyReadonlyArray(plantsData.items)) {
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

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      />
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
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Animated.View
        key={currentStep}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(150)}
        className="flex-1"
      >
        {stepContent}
      </Animated.View>
    </View>
  )
}
