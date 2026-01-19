import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { images } from 'src/assets/images'
import { Button, TextLink } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'

export default function CheckEmailScreen() {
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
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background"
    >
      <View className="flex-1 px-6 justify-between">
        {/* Top Spacer */}
        <View className="h-8" />

        {/* Main Content */}
        <View className="flex-1 items-center justify-center">
          {/* Hero Illustration */}
          <View className="w-64 h-64 items-center justify-center mb-8">
            {/* Outer circle - light green */}
            <View className="absolute w-64 h-64 rounded-full bg-primary-tint" />
            {/* Inner circle - lighter border */}
            <View className="absolute w-56 h-56 rounded-full border-2 border-primary/20" />
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
          <View className="w-full items-center gap-3">
            <Text
              className="text-[28px] text-text-primary text-center"
              style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
            >
              Check your inbox
            </Text>
            <Text
              className="text-base text-text-secondary text-center"
              style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
            >
              We sent a magic link to
            </Text>
            <Text
              className="text-base text-text-primary"
              style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
            >
              {pendingEmail ?? 'your email'}
            </Text>
          </View>
        </View>

        {/* Action Area */}
        <View className="w-full pb-8 gap-6">
          {/* Primary Action Button */}
          <Button icon="mail" iconPosition="left" onPress={handleOpenEmail}>
            Open Email App
          </Button>

          {/* Secondary Actions */}
          <View className="items-center gap-4">
            <TextLink
              icon="refresh"
              iconPosition="right"
              onPress={handleResendLink}
              disabled={resending}
            >
              {resending ? 'Sending...' : 'Resend link'}
            </TextLink>
            <TextLink variant="secondary" onPress={handleDifferentEmail}>
              Use a different email
            </TextLink>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}
