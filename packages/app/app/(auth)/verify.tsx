import { Array as Arr, Match, pipe } from 'effect'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MascotAnimation } from '@/assets/mascot'
import { GlassCard, MascotHero, MeshBackground } from '@/components'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'

// The verify endpoint's English messages for a link that is malformed, expired
// or already used. They map to one translated message instead of being shown raw.
const LINK_REJECTED_ERRORS = ['Invalid or expired code', 'Invalid code format']

const WELCOME_HOLD_MS = 2600
// The API answers in ~60 ms; without a floor "Verifying" shows for one frame
// and the screen flicks straight to the result.
const MIN_VERIFYING_MS = 900

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

type VerifyState =
  | { _tag: 'Verifying' }
  | { _tag: 'Success' }
  | { _tag: 'Error'; message: string }

interface HeroContent {
  animation: MascotAnimation
  title: string
  subtitle: string
}

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

  // A magic-link code is single-use: the effect re-runs when `verifyMagicLink`
  // or `t` change identity, and a second request for the same code hit the
  // API's rate limiter and replaced the result with a failure.
  const attemptedCodeRef = useRef<string | null>(null)

  useEffect(() => {
    if (verificationCode && attemptedCodeRef.current === verificationCode) {
      return
    }
    attemptedCodeRef.current = verificationCode ?? null

    const verify = async () => {
      if (!verificationCode) {
        setVerifyState({
          _tag: 'Error',
          message: t('verify.noCodeProvided'),
        })
        return
      }

      const [result] = await Promise.all([
        verifyMagicLink(verificationCode),
        wait(MIN_VERIFYING_MS),
      ])

      if (result.success) {
        setVerifyState({ _tag: 'Success' })
      } else {
        const message = result.status
          ? t(`verify.accountStatus.${result.status}`, {
              defaultValue: t('verify.failedToVerify'),
            })
          : Arr.contains(LINK_REJECTED_ERRORS, result.error ?? '')
            ? t('verify.expiredCode')
            : t('verify.failedToVerify')
        setVerifyState({ _tag: 'Error', message })
      }
    }

    verify()
  }, [verificationCode, verifyMagicLink, t])

  // Hold the welcome state long enough to read, then let the index route
  // pick the next screen (username, onboarding or the app). AuthContext leaves
  // a freshly signed-in user on this screen for that reason.
  useEffect(() => {
    if (verifyState._tag !== 'Success') return
    const timer = setTimeout(() => router.replace('/'), WELCOME_HOLD_MS)
    return () => clearTimeout(timer)
  }, [verifyState._tag, router])

  const handleRetry = () => {
    router.replace('/(auth)/login')
  }

  const heroContent = pipe(
    Match.value(verifyState),
    Match.when(
      { _tag: 'Verifying' },
      (): HeroContent => ({
        animation: 'lookAround',
        title: t('verify.verifying'),
        subtitle: t('verify.verifyingSubtitle'),
      })
    ),
    Match.when(
      { _tag: 'Success' },
      (): HeroContent => ({
        animation: 'celebrate',
        title: t('verify.welcomeTitle'),
        subtitle: t('verify.welcomeSubtitle'),
      })
    ),
    Match.when(
      { _tag: 'Error' },
      ({ message }): HeroContent => ({
        animation: 'rainy',
        title: t('verify.failedTitle'),
        subtitle: message,
      })
    ),
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
        {/* The hero stays mounted across states so the mascot switches clips
            without blanking; only its text fades (MascotHero), and the layout
            transition eases it up when the error card appears. */}
        <Animated.View
          layout={LinearTransition.duration(350)}
          className="flex-1"
        >
          <MascotHero
            animation={heroContent.animation}
            title={heroContent.title}
            subtitle={heroContent.subtitle}
          />
        </Animated.View>

        {verifyState._tag === 'Error' && (
          <Animated.View entering={FadeInDown.duration(350)}>
            <GlassCard style={{ marginTop: 32 }}>
              <Button onPress={handleRetry} pill>
                {t('verify.tryAgain')}
              </Button>
            </GlassCard>
          </Animated.View>
        )}
      </View>
    </MeshBackground>
  )
}
