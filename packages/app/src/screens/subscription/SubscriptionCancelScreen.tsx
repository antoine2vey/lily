import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { Linking, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIconColors } from 'src/hooks/useIconColors'

const FEATURES_LOST = [
  'Unlimited AI plant diagnostics',
  'Detailed care guides',
  'Advanced plant statistics',
  'Priority support',
]

const getSubscriptionManagementUrl = (): string => {
  return pipe(Platform.OS, (os) =>
    os === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions'
  )
}

export function SubscriptionCancelScreen() {
  const iconColors = useIconColors()

  const handleOpenSubscriptionSettings = async () => {
    const url = getSubscriptionManagementUrl()
    const canOpen = await Linking.canOpenURL(url)

    if (canOpen) {
      await Linking.openURL(url)
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={['top']}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
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
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary dark:text-white">
          Cancel Subscription
        </Text>
      </View>

      <View className="flex-1 px-4 pt-8">
        {/* Sad plant icon */}
        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full items-center justify-center bg-coral/10">
            <MaterialIcons
              name="sentiment-dissatisfied"
              size={48}
              color={iconColors.coral}
            />
          </View>
        </View>

        {/* Title */}
        <Text className="text-2xl text-center mb-2 font-bold text-text-primary dark:text-white">
          We're sad to see you go
        </Text>

        {/* Subtitle */}
        <Text className="text-base text-center mb-8 text-text-secondary dark:text-slate-400">
          If you cancel, you'll lose access to these premium features:
        </Text>

        {/* Features lost */}
        <View className="rounded-2xl p-4 mb-8 gap-4 bg-surface dark:bg-surface-dark">
          {pipe(
            FEATURES_LOST,
            Array.map((feature) => (
              <View key={feature} className="flex-row items-center">
                <View className="w-8 h-8 rounded-full items-center justify-center mr-3 bg-coral/10">
                  <MaterialIcons
                    name="close"
                    size={18}
                    color={iconColors.coral}
                  />
                </View>
                <Text className="flex-1 text-base text-text-primary dark:text-white">
                  {feature}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Info box */}
        <View className="flex-row rounded-xl p-4 mb-8 bg-primary-tint dark:bg-primary/20">
          <MaterialIcons
            name="info-outline"
            size={20}
            color={iconColors.primary}
            style={{ marginRight: 12, marginTop: 2 }}
          />
          <Text className="flex-1 text-sm text-text-secondary dark:text-slate-400">
            You'll retain access to premium features until the end of your
            current billing period. You can resubscribe anytime.
          </Text>
        </View>

        {/* Spacer */}
        <View className="flex-1" />

        {/* Action buttons */}
        <View className="gap-3 pb-4">
          {/* Keep subscription button */}
          <Pressable
            onPress={() => router.back()}
            className="py-4 rounded-xl items-center bg-primary active:bg-primary-dark"
          >
            <Text className="text-base font-semibold text-white">
              Keep My Subscription
            </Text>
          </Pressable>

          {/* Cancel button */}
          <Pressable
            onPress={handleOpenSubscriptionSettings}
            className="py-4 rounded-xl items-center border border-coral bg-transparent active:bg-coral/10"
          >
            <Text className="text-base font-semibold text-coral">
              Continue to Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
