import { BlurView } from 'expo-blur'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MeshBackground } from 'src/components'
import { Button, TextLink } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { useThemeContext } from 'src/contexts/ThemeContext'

export default function CheckEmailScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('auth')
  const { pendingEmail, login } = useAuth()
  const router = useRouter()
  const { isDark } = useThemeContext()
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
          <Text className="text-6xl mb-4">📬</Text>
          <Text
            className="text-4xl text-white text-center mb-3"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            {t('checkEmail.title')}
          </Text>
          <Text
            className="text-base text-white/70 text-center leading-relaxed max-w-[280px]"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('checkEmail.subtitle')}
            {'\n'}
            <Text
              className="text-white"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            >
              {pendingEmail ?? t('checkEmail.emailFallback')}
            </Text>
          </Text>
        </View>

        {/* Glassmorphism Card — bottom */}
        <View
          className="mx-4 rounded-3xl overflow-hidden"
          style={{ marginBottom: insets.bottom + 16 }}
        >
          <BlurView
            intensity={40}
            tint={isDark ? 'dark' : 'light'}
            className="p-6"
          >
            <View className="gap-4">
              <Button
                icon="mail"
                iconPosition="left"
                onPress={handleOpenEmail}
                pill
              >
                {t('checkEmail.openEmailApp')}
              </Button>

              <View className="items-center gap-4">
                <TextLink
                  icon="refresh"
                  iconPosition="right"
                  onPress={handleResendLink}
                  disabled={resending}
                >
                  {resending
                    ? t('checkEmail.sending')
                    : t('checkEmail.resendLink')}
                </TextLink>
                <TextLink variant="secondary" onPress={handleDifferentEmail}>
                  {t('checkEmail.differentEmail')}
                </TextLink>
              </View>
            </View>
          </BlurView>
        </View>
      </View>
    </MeshBackground>
  )
}
