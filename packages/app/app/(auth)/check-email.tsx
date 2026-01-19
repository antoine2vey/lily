import { MaterialIcons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { SafeAreaView, Text, View } from 'react-native'
import { Button, TextLink } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { colors } from 'src/theme'

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
    <SafeAreaView className="flex-1 bg-background-light dark:bg-background-dark">
      <View className="flex-1 max-w-md w-full mx-auto p-6 justify-between">
        {/* Top Spacer */}
        <View className="h-4" />

        {/* Main Content */}
        <View className="flex-1 items-center justify-center gap-2">
          {/* Hero Illustration */}
          <View className="w-full items-center py-8">
            <View className="relative w-64 h-64 rounded-full bg-primary/10 dark:bg-primary/5 items-center justify-center">
              <View className="w-48 h-48 items-center justify-center">
                <MaterialIcons
                  name="mail-outline"
                  size={80}
                  color={colors.primary}
                />
                <View className="absolute -bottom-2">
                  <MaterialIcons name="eco" size={40} color={colors.primary} />
                </View>
              </View>
              {/* Decorative circle */}
              <View className="absolute w-56 h-56 rounded-full border border-primary/20 dark:border-primary/10" />
            </View>
          </View>

          {/* Typography Block */}
          <View className="w-full items-center gap-2">
            <Text
              className="text-3xl text-center text-text-main dark:text-white px-4 pb-2 pt-2"
              style={{ fontFamily: 'PlusJakartaSans_800ExtraBold' }}
            >
              Check your inbox
            </Text>
            <Text
              className="text-base text-center text-text-secondary dark:text-zinc-400 px-4 max-w-[300px]"
              style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
            >
              We sent a magic link to{'\n'}
              <Text
                className="text-text-main dark:text-white"
                style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
              >
                {pendingEmail ?? 'your email'}
              </Text>
            </Text>
          </View>
        </View>

        {/* Action Area */}
        <View className="w-full pb-8 pt-10 gap-6">
          {/* Primary Action Button */}
          <View className="px-4">
            <Button icon="mail" iconPosition="left" onPress={handleOpenEmail}>
              Open Email App
            </Button>
          </View>

          {/* Secondary Actions */}
          <View className="items-center gap-5">
            <TextLink
              icon="refresh"
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

        {/* Bottom Spacer */}
        <View className="h-4" />
      </View>
    </SafeAreaView>
  )
}
