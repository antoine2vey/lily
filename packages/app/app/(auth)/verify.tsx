import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { iconColors } from 'src/theme'

type VerifyState =
  | { _tag: 'Verifying' }
  | { _tag: 'Success' }
  | { _tag: 'Error'; message: string }

export default function VerifyScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('auth')
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
          message: t('verify.noCodeProvided'),
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
          message: result.error ?? t('verify.failedToVerify'),
        })
      }
    }

    verify()
  }, [verificationCode, verifyMagicLink, t])

  const handleRetry = () => {
    router.replace('/(auth)/login')
  }

  return (
    <View
      className="flex-1 bg-background-light dark:bg-background-dark"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
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
                  {t('verify.verifying')}
                </Text>
                <Text className="text-base font-regular text-text-secondary dark:text-zinc-400 text-center">
                  {t('verify.verifyingSubtitle')}
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
                  {t('verify.welcomeTitle')}
                </Text>
                <Text className="text-base font-regular text-text-secondary dark:text-zinc-400 text-center">
                  {t('verify.welcomeSubtitle')}
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
                  {t('verify.failedTitle')}
                </Text>
                <Text className="text-base font-regular text-text-secondary dark:text-zinc-400 text-center">
                  {message}
                </Text>
              </View>
              <View className="w-full mt-4">
                <Button onPress={handleRetry}>{t('verify.tryAgain')}</Button>
              </View>
            </View>
          )),
          Match.exhaustive
        )}
      </View>
    </View>
  )
}
