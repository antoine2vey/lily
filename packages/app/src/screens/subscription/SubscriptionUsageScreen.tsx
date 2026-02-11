import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRevenueCat } from 'src/contexts/RevenueCatContext'
import { useIconColors } from 'src/hooks/useIconColors'
import { useSubscriptionUsage } from 'src/hooks/useSubscriptionUsage'
import { PlanCard } from 'src/screens/subscription/components/PlanCard'
import { UsageMeter } from 'src/screens/subscription/components/UsageMeter'
import * as RevenueCatService from 'src/services/revenuecat'

const USAGE_ICONS = {
  ai_chats: 'chat' as const,
  plant_ids: 'local-florist' as const,
  card_scans: 'qr-code-scanner' as const,
}

export function SubscriptionUsageScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation(['subscription', 'common'])
  const { data, isLoading } = useSubscriptionUsage()
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

  if (isLoading || !data) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </View>
    )
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="arrow-back-ios-new"
            size={20}
            color={iconColors.primary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-center mr-10 font-bold text-text-primary dark:text-white">
          {t('usage.title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 8 }}
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

        {/* Bottom spacer */}
        <View className="h-8" />
      </ScrollView>
    </View>
  )
}
