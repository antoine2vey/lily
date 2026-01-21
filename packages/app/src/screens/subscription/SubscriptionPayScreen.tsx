import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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

  const handleSubscribe = async () => {
    setIsLoading(true)
    try {
      // TODO: Implement actual purchase via RevenueCat
      await new Promise((resolve) => setTimeout(resolve, 1000))
      Alert.alert('Success', 'Thank you for subscribing to Lily Pro!', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch {
      Alert.alert('Error', 'Failed to complete purchase. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const getPrice = () => {
    return billingPeriod === 'monthly' ? '$4.99/month' : '$39.99/year'
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
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
            {/* Placeholder for hero image */}
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
            monthlyPrice="$4.99"
            annualPrice="$39.99"
            savingsPercent={33}
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
