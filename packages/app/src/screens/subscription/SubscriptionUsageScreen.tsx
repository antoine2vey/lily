import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GlassBackButton } from '@/components/GlassBackButton'
import { useRevenueCat } from '@/contexts/RevenueCatContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useSubscriptionUsage } from '@/hooks/useSubscriptionUsage'
import { PlanCard } from '@/screens/subscription/components/PlanCard'
import { SubscriptionUsageSkeleton } from '@/screens/subscription/components/SubscriptionUsageSkeleton'
import { UsageMeter } from '@/screens/subscription/components/UsageMeter'
import * as RevenueCatService from '@/services/revenuecat'

const USAGE_ICONS = {
  ai_chats: 'chat' as const,
  plant_ids: 'local-florist' as const,
  card_scans: 'qr-code-scanner' as const,
}

export function SubscriptionUsageScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation(['subscription', 'common'])
  const { data, isLoading, error } = useSubscriptionUsage()
  const { restore } = useRevenueCat()
  const [isRestoring, setIsRestoring] = useState(false)
  const iconColors = useIconColors()

  const USAGE_CONFIG = {
    ai_chats: {
      icon: USAGE_ICONS.ai_chats,
      label: t('usage.aiChats'),
    },
    plant_ids: {
      icon: USAGE_ICONS.plant_ids,
      label: t('usage.plantIds'),
    },
    card_scans: {
      icon: USAGE_ICONS.card_scans,
      label: t('usage.cardScans'),
    },
  }

  const PREMIUM_FEATURES = [
    t('features.unlimitedDiagnostics'),
    t('features.detailedGuides'),
    t('features.advancedStats'),
  ]

  const handleRestorePurchases = async () => {
    setIsRestoring(true)
    try {
      await restore()

      const message = RevenueCatService.isDevModeEnabled()
        ? t('messages.restoreSimulated')
        : t('messages.restoreSuccess')

      Alert.alert(t('subscription:messages.success'), message, [
        { text: t('common:buttons.ok') },
      ])
    } catch {
      Alert.alert(t('messages.error'), t('messages.restoreFailed'))
    } finally {
      setIsRestoring(false)
    }
  }

  const handleCancelSubscription = () => {
    router.push('/subscription/cancel')
  }

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  if (error) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark items-center justify-center p-6"
        style={{ paddingTop: insets.top }}
      >
        <MaterialIcons
          name="error-outline"
          size={48}
          color={iconColors.coral}
        />
        <Text className="text-lg text-center mt-4 font-semibold text-text-primary dark:text-white">
          {t('subscription:error', {
            defaultValue: 'Failed to load subscription',
          })}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 px-6 py-3 rounded-full bg-primary"
        >
          <Text className="font-semibold text-white">
            {t('common:buttons.goBack', { defaultValue: 'Go Back' })}
          </Text>
        </Pressable>
      </View>
    )
  }

  if (showSkeleton) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-3">
          <GlassBackButton />
          <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
            {t('usage.title')}
          </Text>
        </View>
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <SubscriptionUsageSkeleton />
        </Animated.View>
      </View>
    )
  }

  if (isInitialLoading || !data) {
    return null
  }

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <GlassBackButton />
        <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
          {t('usage.title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8 }}
      >
        {/* Current Plan Card */}
        <View className="mt-2">
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

        {/* Cancel Subscription Button (Premium users only) */}
        {data.isPremium &&
          Array.contains(['active', 'trialing'], data.status) && (
            <View className="mx-4 mt-6">
              <Pressable
                onPress={handleCancelSubscription}
                className="py-4 rounded-xl items-center border border-coral bg-transparent active:bg-coral/10"
              >
                <Text className="text-base font-semibold text-coral">
                  {t('buttons.cancelSubscription')}
                </Text>
              </Pressable>
            </View>
          )}

        {/* Premium Upgrade Card */}
        {!data.isPremium && (
          <View className="mx-4 mt-6 rounded-2xl p-6 items-center shadow-lg border border-primary/20 bg-surface dark:bg-surface-dark overflow-hidden">
            {/* Star Icon */}
            <View className="w-14 h-14 rounded-full items-center justify-center mb-4 bg-primary-tint dark:bg-primary/20 border border-primary/20">
              <MaterialIcons name="star" size={28} color={iconColors.primary} />
            </View>

            {/* Premium Access Label */}
            <Text className="text-sm mb-1 uppercase tracking-widest font-bold text-primary">
              {t('title')}
            </Text>

            {/* Title */}
            <Text className="text-2xl mb-4 font-bold text-text-primary dark:text-white">
              {t('usage.upgradeTo')}
            </Text>

            {/* Feature List */}
            <View className="w-full rounded-xl p-4 mb-4 gap-3 bg-background dark:bg-background-dark border border-border/30 dark:border-slate-700/30">
              {pipe(
                PREMIUM_FEATURES,
                Array.map((feature) => (
                  <View key={feature} className="flex-row items-start gap-3">
                    <MaterialIcons
                      name="check-circle"
                      size={20}
                      color={iconColors.primary}
                    />
                    <Text className="text-sm font-medium text-text-primary dark:text-white flex-1">
                      {feature}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* View Plans Button */}
            <Pressable
              onPress={() => router.push('/subscription/upgrade')}
              className="w-full py-4 rounded-xl items-center bg-primary active:bg-primary-dark"
            >
              <Text className="text-base font-bold text-white">
                {t('buttons.viewPlans')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Restore Purchases */}
        <View className="items-center py-6">
          <Pressable onPress={handleRestorePurchases} disabled={isRestoring}>
            <Text className="text-sm font-medium text-text-muted dark:text-slate-400">
              {isRestoring ? t('messages.restoring') : t('buttons.restore')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Animated.View>
  )
}
