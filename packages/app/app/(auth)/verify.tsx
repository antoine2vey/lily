import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, Text, View } from 'react-native'
import { Button } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { iconColors } from 'src/theme'

type VerifyState =
  | { _tag: 'Verifying' }
  | { _tag: 'Success' }
  | { _tag: 'Error'; message: string }

export default function VerifyScreen() {
  // Accept both 'code' (new) and 'token' (legacy) params
  const { code, token } = useLocalSearchParams<{
    code?: string
    token?: string
  }>()
  const verificationCode = code || token
  const [verifyState, setVerifyState] = useState<VerifyState>({
    _tag: 'Verifying',
  })
  const { verifyMagicLink } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const verify = async () => {
      if (!verificationCode) {
        setVerifyState({
          _tag: 'Error',
          message: 'No verification code provided',
        })
        return
      }

      const result = await verifyMagicLink(verificationCode)

      if (result.success) {
        setVerifyState({ _tag: 'Success' })
        // Navigation is handled by AuthContext based on user state
      } else {
        setVerifyState({
          _tag: 'Error',
          message: result.error ?? 'Verification failed',
        })
      }
    }

    verify()
  }, [verificationCode, verifyMagicLink])

  const handleRetry = () => {
    router.replace('/(auth)/login')
  }

  return (
    <SafeAreaView className="flex-1 bg-background-light dark:bg-background-dark">
      <View className="flex-1 items-center justify-center p-6">
        {pipe(
          Match.value(verifyState),
          Match.when({ _tag: 'Verifying' }, () => (
            <View className="items-center gap-6">
              <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center">
                <ActivityIndicator size="large" color={iconColors.primary} />
              </View>
              <View className="items-center gap-2">
                <Text className="text-2xl font-bold text-text-main dark:text-white">
                  Verifying...
                </Text>
                <Text className="text-base font-regular text-text-secondary dark:text-zinc-400 text-center">
                  Please wait while we verify your magic link
                </Text>
              </View>
            </View>
          )),
          Match.when({ _tag: 'Success' }, () => (
            <View className="items-center gap-6">
              <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center">
                <MaterialIcons
                  name="check-circle"
                  size={48}
                  color={iconColors.primary}
                />
              </View>
              <View className="items-center gap-2">
                <Text className="text-2xl font-bold text-text-main dark:text-white">
                  Welcome!
                </Text>
                <Text className="text-base font-regular text-text-secondary dark:text-zinc-400 text-center">
                  You've been successfully signed in
                </Text>
              </View>
            </View>
          )),
          Match.when({ _tag: 'Error' }, ({ message }) => (
            <View className="items-center gap-6 w-full max-w-sm">
              <View className="w-24 h-24 rounded-full bg-red-500/10 items-center justify-center">
                <MaterialIcons
                  name="error-outline"
                  size={48}
                  color={iconColors.error}
                />
              </View>
              <View className="items-center gap-2">
                <Text className="text-2xl font-bold text-text-main dark:text-white">
                  Verification Failed
                </Text>
                <Text className="text-base font-regular text-text-secondary dark:text-zinc-400 text-center">
                  {message}
                </Text>
              </View>
              <View className="w-full mt-4">
                <Button onPress={handleRetry}>Try Again</Button>
              </View>
            </View>
          )),
          Match.exhaustive
        )}
      </View>
    </SafeAreaView>
  )
}
