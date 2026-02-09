import { MaterialIcons } from '@expo/vector-icons'
import { Match, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRevenueCat } from 'src/contexts/RevenueCatContext'
import { useIconColors } from 'src/hooks/useIconColors'
import * as RevenueCatService from 'src/services/revenuecat'
import { FeatureList } from './components/FeatureList'
import { PricingToggle } from './components/PricingToggle'

type BillingPeriod = 'monthly' | 'annual'

export function SubscriptionPayScreen() {
  const { t } = useTranslation(['subscription', 'common'])
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('annual')
  const [isLoading, setIsLoading] = useState(false)
  const { offerings, purchase, syncSubscription } = useRevenueCat()
  const iconColors = useIconColors()

  const PREMIUM_FEATURES = [
    {
      title: t('features.unlimitedChats.title'),
      description: t('features.unlimitedChats.description'),
    },
    {
      title: t('features.expertConsultations.title'),
      description: t('features.expertConsultations.description'),
    },
    {
      title: t('features.noAds.title'),
      description: t('features.noAds.description'),
    },
    {
      title: t('features.prioritySupport.title'),
      description: t('features.prioritySupport.description'),
    },
  ]

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
      Alert.alert(t('messages.error'), t('messages.noPackage'))
      return
    }

    setIsLoading(true)
    try {
      await purchase(selectedPackage)

      // Sync subscription after purchase (with small delay for webhook processing)
      setTimeout(() => {
        syncSubscription()
      }, 500)

      const message = RevenueCatService.isDevModeEnabled()
        ? t('messages.devPurchase')
        : t('messages.thankYou')

      Alert.alert(t('subscription:messages.success'), message, [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ])
    } catch (error) {
      // User cancelled purchase is not an error
      const isCancelled =
        error instanceof Error && error.message.includes('cancelled')
      if (!isCancelled) {
        Alert.alert(t('messages.error'), t('messages.purchaseFailed'))
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

  const introPrice = pipe(
    Option.fromNullable(selectedPackage?.product.introPrice),
    Option.filter((ip) => ip.price === 0),
    Option.getOrUndefined
  )

  const hasFreeTrial = !!introPrice

  const trialDays = pipe(
    Option.fromNullable(introPrice),
    Option.map((ip) =>
      pipe(
        Match.value(ip.periodUnit),
        Match.when('WEEK', () => ip.periodNumberOfUnits * 7),
        Match.when('MONTH', () => ip.periodNumberOfUnits * 30),
        Match.when('YEAR', () => ip.periodNumberOfUnits * 365),
        Match.orElse(() => ip.periodNumberOfUnits)
      )
    ),
    Option.getOrElse(() => 7)
  )

  const getPrice = () =>
    billingPeriod === 'monthly'
      ? `${monthlyPrice}${t('pricing.perMonth')}`
      : `${annualPrice}${t('pricing.perYear')}`

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={['top']}
    >
      {/* Close Button */}
      <View className="absolute top-14 left-4 z-50">
        <Pressable
          testID="close-button"
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full bg-surface/80 dark:bg-surface-dark/80 shadow-sm border border-border/30 dark:border-slate-700/30"
        >
          <MaterialIcons
            name="close"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 60 }}
      >
        {/* Content */}
        <View className="gap-6">
          {/* Title Section */}
          <View className="items-center px-6 gap-2">
            {/* Premium Access Badge */}
            <View className="flex-row items-center px-3 py-1 rounded-full bg-primary-tint dark:bg-primary/20 border border-primary/20">
              <MaterialIcons
                name="diamond"
                size={14}
                color={iconColors.primary}
              />
              <Text className="text-xs ml-1.5 uppercase tracking-wider font-bold text-primary">
                {t('title')}
              </Text>
            </View>

            {/* Trial Badge */}
            {hasFreeTrial && (
              <View className="px-3 py-1 rounded-full bg-warning/10 border border-warning/20">
                <Text className="text-xs font-bold text-warning">
                  {t('trial.badge', { days: trialDays })}
                </Text>
              </View>
            )}

            {/* Title */}
            <Text className="text-3xl text-center font-bold text-text-primary dark:text-white">
              {t('headline')}
            </Text>

            {/* Subtitle */}
            <Text className="text-sm text-center leading-relaxed font-regular text-text-muted dark:text-slate-400 max-w-[280px]">
              {t('description')}
            </Text>
          </View>

          {/* Feature List */}
          <FeatureList features={PREMIUM_FEATURES} />

          {/* Pricing Toggle */}
          <View className="pt-2">
            <PricingToggle
              selected={billingPeriod}
              onSelect={setBillingPeriod}
              monthlyPrice={monthlyPrice}
              annualPrice={annualPrice}
              savingsPercent={33}
              trialText={
                hasFreeTrial ? t('trial.badge', { days: trialDays }) : undefined
              }
            />
          </View>

          {/* Subscribe Button */}
          <View className="px-4 pt-4">
            <Pressable
              onPress={handleSubscribe}
              disabled={isLoading}
              className={`py-4 rounded-2xl items-center ${isLoading ? 'bg-primary-dark opacity-70' : 'bg-primary active:bg-primary-dark'}`}
            >
              <Text className="text-lg font-bold text-white">
                {isLoading
                  ? t('buttons.processing')
                  : hasFreeTrial
                    ? t('trial.startTrial')
                    : t('buttons.subscribe', { price: getPrice() })}
              </Text>
            </Pressable>

            {/* Terms */}
            <Text className="text-xs text-center mt-3 font-medium text-text-muted dark:text-slate-400">
              {hasFreeTrial
                ? t('trial.billingInfo', {
                    days: trialDays,
                    price: getPrice(),
                  })
                : t('billing')}
            </Text>
          </View>

          {/* Trust Badges & Links */}
          <View className="items-center gap-5 border-t border-border/30 dark:border-slate-700/30 mx-4 pt-6 mt-2">
            {/* Trust Badges */}
            <View className="flex-row items-center gap-8 opacity-70">
              <View className="flex-row items-center gap-1.5">
                <MaterialIcons
                  name="verified-user"
                  size={20}
                  color={iconColors.textSecondary}
                />
                <Text className="text-[10px] font-bold uppercase tracking-wider text-text-secondary dark:text-slate-300">
                  {t('badges.secure')}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <MaterialIcons
                  name="star"
                  size={20}
                  color={iconColors.textSecondary}
                />
                <Text className="text-[10px] font-bold uppercase tracking-wider text-text-secondary dark:text-slate-300">
                  {t('badges.topRated')}
                </Text>
              </View>
            </View>

            {/* Restore Purchase */}
            <Pressable>
              <Text className="text-xs font-semibold text-text-muted dark:text-slate-400 underline">
                {t('buttons.restore')}
              </Text>
            </Pressable>

            {/* Legal Links */}
            <View className="flex-row gap-4">
              <Pressable>
                <Text className="text-[10px] font-medium text-text-muted dark:text-slate-400">
                  {t('legal.terms')}
                </Text>
              </Pressable>
              <Pressable>
                <Text className="text-[10px] font-medium text-text-muted dark:text-slate-400">
                  {t('legal.privacy')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
