import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRevenueCat } from 'src/contexts/RevenueCatContext'
import { useSubscriptionUsage } from 'src/hooks/useSubscriptionUsage'
import { useSyncSubscription } from 'src/hooks/useSyncSubscription'
import * as RevenueCatService from 'src/services/revenuecat'
import { iconColors } from 'src/theme'
import { PlanCard } from './components/PlanCard'
import { UsageMeter } from './components/UsageMeter'

const USAGE_CONFIG = {
  ai_chats: {
    icon: 'chat' as const,
    label: 'AI Chats',
  },
  plant_ids: {
    icon: 'local-florist' as const,
    label: 'Plant IDs',
  },
  card_scans: {
    icon: 'qr-code-scanner' as const,
    label: 'Card Scans',
  },
}

const PREMIUM_FEATURES = [
  'Unlimited AI Diagnostics',
  'Detailed Care Guides',
  'Advanced Statistics',
]

export function SubscriptionUsageScreen() {
  const { data, isLoading } = useSubscriptionUsage()
  const { restore } = useRevenueCat()
  const syncMutation = useSyncSubscription()
  const [isRestoring, setIsRestoring] = useState(false)

  const handleRestorePurchases = async () => {
    setIsRestoring(true)
    try {
      await restore()
      await syncMutation.mutateAsync({})

      const message = RevenueCatService.isDevModeEnabled()
        ? 'Restore simulated! (Dev Mode)'
        : 'Purchases restored successfully.'

      Alert.alert('Success', message, [{ text: 'OK' }])
    } catch {
      Alert.alert('Error', 'Failed to restore purchases. Please try again.')
    } finally {
      setIsRestoring(false)
    }
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary">
          Subscription
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Current Plan Card */}
        <View className="mt-4">
          <PlanCard planName={data.planName} status={data.status}>
            {pipe(
              data.usage,
              Array.map((item) => {
                const config = USAGE_CONFIG[item.type]
                return (
                  <UsageMeter
                    key={item.type}
                    icon={config.icon}
                    label={config.label}
                    current={item.current}
                    max={item.max}
                  />
                )
              })
            )}
          </PlanCard>
        </View>

        {/* Premium Upgrade Card */}
        {!data.isPremium && (
          <View className="mx-4 mt-4 rounded-2xl p-6 items-center shadow-sm bg-surface">
            {/* Star Icon */}
            <View className="w-14 h-14 rounded-full items-center justify-center mb-4 bg-primary-tint">
              <MaterialIcons name="star" size={28} color={iconColors.primary} />
            </View>

            {/* Premium Access Label */}
            <Text className="text-xs mb-2 uppercase tracking-wider font-semibold text-primary">
              Premium Access
            </Text>

            {/* Title */}
            <Text className="text-xl mb-4 font-bold text-text-primary">
              Upgrade to Lily Pro
            </Text>

            {/* Feature List */}
            <View className="w-full rounded-xl p-4 mb-6 gap-3 bg-background">
              {pipe(
                PREMIUM_FEATURES,
                Array.map((feature) => (
                  <View key={feature} className="flex-row items-center">
                    <View className="w-6 h-6 rounded-full items-center justify-center mr-3 bg-primary-tint">
                      <MaterialIcons
                        name="check"
                        size={14}
                        color={iconColors.primary}
                      />
                    </View>
                    <Text className="text-sm font-medium text-text-primary">
                      {feature}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* View Plans Button */}
            <Pressable
              onPress={() => router.push('/subscription/upgrade')}
              className="w-full py-4 rounded-full items-center bg-primary active:bg-primary-dark"
            >
              <Text className="text-base font-semibold text-white">
                View Plans
              </Text>
            </Pressable>
          </View>
        )}

        {/* Restore Purchases */}
        <Pressable
          onPress={handleRestorePurchases}
          disabled={isRestoring}
          className="items-center py-6"
        >
          <Text className="text-sm font-medium text-text-muted">
            {isRestoring ? 'Restoring...' : 'Restore Purchases'}
          </Text>
        </Pressable>

        {/* Bottom spacer */}
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  )
}
