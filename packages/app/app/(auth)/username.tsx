import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MeshBackground } from 'src/components'
import { Button } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { useThemeContext } from 'src/contexts/ThemeContext'
import { useIconColors } from 'src/hooks/useIconColors'
import { apiEffectRunner } from 'src/utils/client'

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
  const iconColors = useIconColors()
  const { isDark } = useThemeContext()

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
          urlParams: { username: value },
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
        urlParams: { username },
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

  const getValidationIcon = () =>
    pipe(
      Match.value(validation),
      Match.when({ _tag: 'Available' }, () => (
        <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
          <MaterialIcons name="check" size={20} color={iconColors.primary} />
        </View>
      )),
      Match.when({ _tag: 'Invalid' }, () => (
        <View className="w-8 h-8 rounded-full bg-error/20 items-center justify-center">
          <MaterialIcons name="close" size={20} color={iconColors.error} />
        </View>
      )),
      Match.when({ _tag: 'Unavailable' }, () => (
        <View className="w-8 h-8 rounded-full bg-error/20 items-center justify-center">
          <MaterialIcons name="close" size={20} color={iconColors.error} />
        </View>
      )),
      Match.when({ _tag: 'Checking' }, () => (
        <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center">
          <MaterialIcons name="more-horiz" size={20} color="#FFFFFF" />
        </View>
      )),
      Match.orElse(() => null)
    )

  const getValidationStatus = () =>
    pipe(
      Match.value(validation),
      Match.when({ _tag: 'Available' }, () => (
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-primary" />
          <Text className="text-xs font-bold text-primary uppercase tracking-wide">
            {t('username.available')}
          </Text>
        </View>
      )),
      Match.when({ _tag: 'Invalid' }, ({ reason }) => (
        <Text className="text-xs font-medium text-error">{reason}</Text>
      )),
      Match.when({ _tag: 'Unavailable' }, ({ reason }) => (
        <Text className="text-xs font-medium text-error">{reason}</Text>
      )),
      Match.orElse(() => null)
    )

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
          {/* Hero Section */}
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-6xl mb-4">👋</Text>
            <Text
              className="text-4xl text-white text-center mb-1"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            >
              {t('username.headlinePartOne')}
            </Text>
            <Text
              className="text-4xl text-white text-center mb-3"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            >
              {t('username.headlinePartTwo')}
            </Text>
            <Text
              className="text-base text-white/70 text-center leading-relaxed max-w-[300px]"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
            >
              {t('username.description')}
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
                {/* Username Input */}
                <View>
                  <View className="flex-row items-center w-full h-14 rounded-full bg-white/20 px-5">
                    <Text
                      className="text-lg text-white/60 mr-1"
                      style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                    >
                      @
                    </Text>
                    <TextInput
                      className="flex-1 text-lg text-white"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                      placeholder={t('username.placeholder')}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={MAX_USERNAME_LENGTH}
                    />
                    {getValidationIcon()}
                  </View>

                  <View className="flex-row justify-between items-center px-4 mt-2">
                    {getValidationStatus()}
                    <Text
                      className="text-sm text-white/40"
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
              </View>
            </BlurView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </MeshBackground>
  )
}
