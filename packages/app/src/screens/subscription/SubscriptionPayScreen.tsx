import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRevenueCat } from 'src/contexts/RevenueCatContext'
import { useSyncSubscription } from 'src/hooks/useSyncSubscription'
import * as RevenueCatService from 'src/services/revenuecat'
import { iconColors } from 'src/theme'
import { FeatureList } from './components/FeatureList'
import { PricingToggle } from './components/PricingToggle'

type BillingPeriod = 'monthly' | 'annual'

const PREMIUM_FEATURES = [
  {
    title: 'Unlimited AI Chats',
    description: 'Instant answers for all your plant questions',
  },
  {
    title: 'Expert Consultations',
    description: '1-on-1 advice from certified botanists',
  },
  {
    title: 'No Ads',
    description: 'Focus on your garden, distraction-free',
  },
  {
    title: 'Priority Support',
    description: 'Skip the line whenever you need help',
  },
]

export function SubscriptionPayScreen() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('annual')
  const [isLoading, setIsLoading] = useState(false)
  const { offerings, purchase } = useRevenueCat()
  const syncMutation = useSyncSubscription()

  const monthlyPackage = pipe(
    Option.fromNullable(offerings?.current?.monthly),
    Option.getOrUndefined
  )

  const annualPackage = pipe(
    Option.fromNullable(offerings?.current?.annual),
    Option.getOrUndefined
  )

  const selectedPackage =
    billingPeriod === 'monthly' ? monthlyPackage : annualPackage

  const handleSubscribe = async () => {
    if (!selectedPackage) {
      Alert.alert('Error', 'No package available. Please try again later.')
      return
    }

    setIsLoading(true)
    try {
      // 1. Execute purchase via RevenueCat SDK (or mock in dev mode)
      await purchase(selectedPackage)

      // 2. Tell backend to sync (ensures DB is updated even if webhook is delayed)
      await syncMutation.mutateAsync({})

      // 3. Navigate back on success
      const message = RevenueCatService.isDevModeEnabled()
        ? 'Purchase simulated! (Dev Mode)\n\nIn production, this would be a real purchase.'
        : 'Thank you for subscribing to Lily Pro!'

      Alert.alert('Success', message, [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (error) {
      // User cancelled purchase is not an error
      const isCancelled =
        error instanceof Error && error.message.includes('cancelled')
      if (!isCancelled) {
        Alert.alert('Error', 'Failed to complete purchase. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const monthlyPrice = pipe(
    Option.fromNullable(monthlyPackage?.product.priceString),
    Option.getOrElse(() => '€4.99')
  )

  const annualPrice = pipe(
    Option.fromNullable(annualPackage?.product.priceString),
    Option.getOrElse(() => '€29.99')
  )

  const getPrice = () =>
    billingPeriod === 'monthly'
      ? `${monthlyPrice}/month`
      : `${annualPrice}/year`

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          testID="close-button"
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="close"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Hero Image */}
        <View className="items-center px-8 mb-4">
          <View className="w-48 h-48 rounded-2xl overflow-hidden items-center justify-center bg-surface-tinted">
            <MaterialIcons
              name="local-florist"
              size={80}
              color={iconColors.primary}
            />
          </View>
        </View>

        {/* Premium Access Badge */}
        <View className="items-center mb-2">
          <View className="flex-row items-center px-4 py-1.5 rounded-full bg-primary-tint">
            <MaterialIcons
              name="workspace-premium"
              size={16}
              color={iconColors.achievementGold}
            />
            <Text className="text-xs ml-1.5 uppercase tracking-wider font-semibold text-primary">
              Premium Access
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text className="text-2xl text-center mb-2 px-4 font-bold text-text-primary">
          Unlock Lily Pro
        </Text>

        {/* Subtitle */}
        <Text className="text-base text-center mb-6 px-8 font-regular text-text-muted">
          Give your plants the care they deserve with unlimited access to
          premium features.
        </Text>

        {/* Feature List */}
        <View className="mb-8">
          <FeatureList features={PREMIUM_FEATURES} />
        </View>

        {/* Pricing Toggle */}
        <View className="mb-8">
          <PricingToggle
            selected={billingPeriod}
            onSelect={setBillingPeriod}
            monthlyPrice={monthlyPrice}
            annualPrice={annualPrice}
            savingsPercent={50}
          />
        </View>
      </ScrollView>

      {/* Subscribe Button - Fixed at bottom */}
      <View className="px-4 pb-4 pt-2 bg-background">
        <Pressable
          onPress={handleSubscribe}
          disabled={isLoading}
          className={`py-4 rounded-full items-center ${isLoading ? 'bg-primary-dark opacity-70' : 'bg-primary active:bg-primary-dark'}`}
        >
          <Text className="text-base font-semibold text-white">
            {isLoading ? 'Processing...' : `Subscribe for ${getPrice()}`}
          </Text>
        </Pressable>

        {/* Terms */}
        <Text className="text-xs text-center mt-3 font-regular text-text-muted">
          Cancel anytime. Terms and conditions apply.
        </Text>
      </View>
    </SafeAreaView>
  )
}
