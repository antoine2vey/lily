import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MascotAnimation } from '@/assets/mascot'
import { GlassCard, GlassInput, MascotHero, MeshBackground } from '@/components'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { apiEffectRunner } from '@/utils/client'

const MAX_USERNAME_LENGTH = 20
const MIN_USERNAME_LENGTH = 3

type ValidationState =
  | { _tag: 'Idle' }
  | { _tag: 'Checking' }
  | { _tag: 'Available' }
  | { _tag: 'Unavailable'; reason: string }
  | { _tag: 'Invalid'; reason: string }

export default function UsernameSetupScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('auth')
  const [username, setUsername] = useState('')
  const [validation, setValidation] = useState<ValidationState>({
    _tag: 'Idle',
  })
  const [loading, setLoading] = useState(false)
  const { setUsername: saveUsername } = useAuth()
  const router = useRouter()

  const checkRequestRef = useRef(0)

  const validateFormat = useCallback(
    (value: string): ValidationState | null => {
      if (value.length === 0) {
        return { _tag: 'Idle' }
      }

      if (value.length < MIN_USERNAME_LENGTH) {
        return {
          _tag: 'Invalid',
          reason: t('username.tooShort', { min: MIN_USERNAME_LENGTH }),
        }
      }

      if (!/^[a-zA-Z0-9_]+$/.test(value)) {
        return {
          _tag: 'Invalid',
          reason: t('username.invalidChars'),
        }
      }

      return null
    },
    [t]
  )

  const checkAvailability = useCallback(
    async (value: string) => {
      const requestId = ++checkRequestRef.current
      const formatError = validateFormat(value)
      if (formatError) {
        setValidation(formatError)
        return
      }

      setValidation({ _tag: 'Checking' })
      try {
        const result = await apiEffectRunner('username', 'checkUsername', {
          query: { username: value },
        })
        // Ignore stale responses
        if (checkRequestRef.current !== requestId) return

        if (result.available) {
          setValidation({ _tag: 'Available' })
        } else {
          setValidation({
            _tag: 'Unavailable',
            reason: t('username.notAvailable'),
          })
        }
      } catch {
        if (checkRequestRef.current !== requestId) return
        setValidation({
          _tag: 'Invalid',
          reason: t('username.checkFailed'),
        })
      }
    },
    [validateFormat, t]
  )

  useEffect(() => {
    const formatError = validateFormat(username)
    if (formatError) {
      setValidation(formatError)
      return
    }

    setValidation({ _tag: 'Checking' })
    const timer = setTimeout(() => {
      checkAvailability(username)
    }, 300)
    return () => clearTimeout(timer)
  }, [username, validateFormat, checkAvailability])

  const handleSubmit = async () => {
    if (validation._tag !== 'Available' || loading) return

    setLoading(true)
    try {
      // Re-check availability right before saving to avoid race conditions
      const check = await apiEffectRunner('username', 'checkUsername', {
        query: { username },
      })
      if (!check.available) {
        setValidation({
          _tag: 'Unavailable',
          reason: t('username.notAvailable'),
        })
        return
      }

      const result = await saveUsername(username)
      if (result.success) {
        router.replace('/')
      } else {
        setValidation({
          _tag: 'Unavailable',
          reason: result.error ?? t('username.notAvailable'),
        })
      }
    } catch {
      setValidation({
        _tag: 'Invalid',
        reason: t('username.checkFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  const validationBadge = pipe(
    Match.value(validation),
    Match.when({ _tag: 'Available' }, () => (
      <View className="w-8 h-8 rounded-full bg-primary items-center justify-center">
        <MaterialIcons name="check" size={20} color="#FFFFFF" />
      </View>
    )),
    Match.when({ _tag: 'Checking' }, () => (
      <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center">
        <MaterialIcons name="more-horiz" size={20} color="#FFFFFF" />
      </View>
    )),
    Match.whenOr({ _tag: 'Invalid' }, { _tag: 'Unavailable' }, () => (
      <View className="w-8 h-8 rounded-full bg-error items-center justify-center">
        <MaterialIcons name="close" size={20} color="#FFFFFF" />
      </View>
    )),
    Match.orElse(() => null)
  )

  const validationStatus = pipe(
    Match.value(validation),
    Match.when({ _tag: 'Available' }, () => (
      <StatusLine dotClassName="bg-white" uppercase>
        {t('username.available')}
      </StatusLine>
    )),
    Match.whenOr({ _tag: 'Invalid' }, { _tag: 'Unavailable' }, ({ reason }) => (
      <StatusLine dotClassName="bg-error">{reason}</StatusLine>
    )),
    Match.orElse(() => <View />)
  )

  const animation: MascotAnimation =
    validation._tag === 'Available' ? 'jump' : 'hello'
  const hasError =
    validation._tag === 'Invalid' || validation._tag === 'Unavailable'

  return (
    <MeshBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <MascotHero
            animation={animation}
            title={`${t('username.headlinePartOne')}\n${t('username.headlinePartTwo')}`}
            subtitle={t('username.description')}
          />

          <GlassCard style={{ marginTop: 32 }}>
            <View className="gap-2">
              <GlassInput
                prefix="@"
                suffix={validationBadge}
                error={hasError}
                placeholder={t('username.placeholder')}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={MAX_USERNAME_LENGTH}
              />

              <View className="flex-row justify-between items-center gap-3 px-5">
                {validationStatus}
                <Text
                  className="text-xs text-white/75"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {username.length}/{MAX_USERNAME_LENGTH}
                </Text>
              </View>
            </View>

            <Button
              icon="arrow-forward"
              loading={loading}
              disabled={validation._tag !== 'Available'}
              onPress={handleSubmit}
              pill
            >
              {t('username.continueButton')}
            </Button>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </MeshBackground>
  )
}

function StatusLine({
  dotClassName,
  uppercase,
  children,
}: {
  dotClassName: string
  uppercase?: boolean
  children: string
}) {
  return (
    <View className="flex-1 flex-row items-center gap-2">
      <View className={`w-1.5 h-1.5 rounded-full ${dotClassName}`} />
      <Text
        className={`flex-1 text-xs text-white ${uppercase ? 'uppercase tracking-wide' : ''}`}
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {children}
      </Text>
    </View>
  )
}
