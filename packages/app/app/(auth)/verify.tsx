import { Match, pipe } from 'effect'
import { BlurView } from 'expo-blur'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MeshBackground } from 'src/components'
import { Button } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { useThemeContext } from 'src/contexts/ThemeContext'

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
  const { isDark } = useThemeContext()

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
        const message = result.status
          ? t(`verify.accountStatus.${result.status}`, {
              defaultValue: result.error,
            })
          : (result.error ?? t('verify.failedToVerify'))
        setVerifyState({ _tag: 'Error', message })
      }
    }

    verify()
  }, [verificationCode, verifyMagicLink, t])

  const handleRetry = () => {
    router.replace('/(auth)/login')
  }

  const heroContent = pipe(
    Match.value(verifyState),
    Match.when({ _tag: 'Verifying' }, () => ({
      emoji: '🔐',
      title: t('verify.verifying'),
      subtitle: t('verify.verifyingSubtitle'),
    })),
    Match.when({ _tag: 'Success' }, () => ({
      emoji: '🎉',
      title: t('verify.welcomeTitle'),
      subtitle: t('verify.welcomeSubtitle'),
    })),
    Match.when({ _tag: 'Error' }, ({ message }) => ({
      emoji: '😔',
      title: t('verify.failedTitle'),
      subtitle: message,
    })),
    Match.exhaustive
  )

  return (
    <MeshBackground>
      <View
        className="flex-1"
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {/* Hero Section */}
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-6xl mb-4">{heroContent.emoji}</Text>
          <Text
            className="text-4xl text-white text-center mb-3"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            {heroContent.title}
          </Text>
          <Text
            className="text-base text-white/70 text-center leading-relaxed max-w-[280px]"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {heroContent.subtitle}
          </Text>

          {verifyState._tag === 'Verifying' && (
            <ActivityIndicator size="large" color="#FFFFFF" className="mt-8" />
          )}
        </View>

        {/* Glassmorphism Card — only show on error */}
        {verifyState._tag === 'Error' && (
          <View
            className="mx-4 rounded-3xl overflow-hidden"
            style={{ marginBottom: insets.bottom + 16 }}
          >
            <BlurView
              intensity={40}
              tint={isDark ? 'dark' : 'light'}
              className="p-6"
            >
              <Button onPress={handleRetry} pill>
                {t('verify.tryAgain')}
              </Button>
            </BlurView>
          </View>
        )}
      </View>
    </MeshBackground>
  )
}
