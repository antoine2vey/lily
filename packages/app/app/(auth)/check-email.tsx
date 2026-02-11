import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { images } from 'src/assets/images'
import { Button, TextLink } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'

export default function CheckEmailScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('auth')
  const { pendingEmail, login } = useAuth()
  const router = useRouter()
  const [resending, setResending] = useState(false)

  const handleOpenEmail = async () => {
    try {
      await Linking.openURL('mailto:')
    } catch {
      // Silently fail if mail app can't be opened
    }
  }

  const handleResendLink = async () => {
    if (!pendingEmail || resending) return

    setResending(true)
    await login(pendingEmail)
    setResending(false)
  }

  const handleDifferentEmail = () => {
    router.replace('/(auth)/login')
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className="flex-1 px-6 justify-between">
        {/* Top Spacer */}
        <View className="h-8" />

        {/* Main Content */}
        <View className="flex-1 items-center justify-center">
          {/* Hero Illustration */}
          <View className="w-64 h-64 items-center justify-center mb-8">
            {/* Outer circle - light green */}
            <View className="absolute w-64 h-64 rounded-full bg-primary/10" />
            {/* Inner circle - decorative border */}
            <View className="absolute w-56 h-56 rounded-full border border-primary/20" />
            {/* Image container */}
            <View className="w-48 h-48">
              <Image
                source={images.envelopePlant}
                className="w-full h-full"
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Typography Block */}
          <View className="w-full items-center gap-2">
            <Text className="text-[32px] font-extrabold tracking-tight text-text-primary dark:text-white text-center px-4">
              {t('checkEmail.title')}
            </Text>
            <Text className="text-base font-regular text-text-secondary dark:text-slate-400 text-center leading-relaxed px-4 max-w-[300px]">
              {t('checkEmail.subtitle')}
              {'\n'}
              <Text className="font-bold text-text-primary dark:text-white">
                {pendingEmail ?? t('checkEmail.emailFallback')}
              </Text>
            </Text>
          </View>
        </View>

        {/* Action Area */}
        <View className="w-full pt-10 pb-8 gap-6">
          {/* Primary Action Button */}
          <Button
            icon="mail"
            iconPosition="left"
            onPress={handleOpenEmail}
            pill
          >
            {t('checkEmail.openEmailApp')}
          </Button>

          {/* Secondary Actions */}
          <View className="items-center gap-5">
            <TextLink
              icon="refresh"
              iconPosition="right"
              onPress={handleResendLink}
              disabled={resending}
            >
              {resending ? t('checkEmail.sending') : t('checkEmail.resendLink')}
            </TextLink>
            <TextLink variant="secondary" onPress={handleDifferentEmail}>
              {t('checkEmail.differentEmail')}
            </TextLink>
          </View>
        </View>
      </View>
    </View>
  )
}
