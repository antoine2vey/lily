import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MascotAnimation } from '@/assets/mascot'
import { GlassCard, GlassLink, MascotHero, MeshBackground } from '@/components'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'

// One play of the send-envelope clip (123 frames at 24 fps), after which the
// mascot waits around. Any longer and the looping clip restarts on screen.
const SEND_ENVELOPE_CLIP_MS = 5125

export default function CheckEmailScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('auth')
  const { pendingEmail, login } = useAuth()
  const router = useRouter()
  const [resending, setResending] = useState(false)
  const [animation, setAnimation] = useState<MascotAnimation>('sendEnvelope')

  useEffect(() => {
    const timer = setTimeout(
      () => setAnimation('lookAround'),
      SEND_ENVELOPE_CLIP_MS
    )
    return () => clearTimeout(timer)
  }, [])

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
        <MascotHero animation={animation} title={t('checkEmail.title')}>
          <Text
            className="text-base text-white/75 text-center leading-relaxed max-w-[300px] mt-3"
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
        </MascotHero>

        <GlassCard style={{ marginTop: 32 }}>
          <Button
            icon="mail"
            iconPosition="left"
            onPress={handleOpenEmail}
            pill
          >
            {t('checkEmail.openEmailApp')}
          </Button>

          <View className="gap-1">
            <GlassLink
              label={
                resending ? t('checkEmail.sending') : t('checkEmail.resendLink')
              }
              onPress={handleResendLink}
              disabled={resending}
            />
            <GlassLink
              label={t('checkEmail.differentEmail')}
              onPress={handleDifferentEmail}
            />
          </View>
        </GlassCard>
      </View>
    </MeshBackground>
  )
}
