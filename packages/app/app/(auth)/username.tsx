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
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, IconButton } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
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
  const { t } = useTranslation('auth')
  const [username, setUsername] = useState('')
  const [validation, setValidation] = useState<ValidationState>({
    _tag: 'Idle',
  })
  const [loading, setLoading] = useState(false)
  const { setUsername: saveUsername, logout } = useAuth()
  const router = useRouter()
  const iconColors = useIconColors()

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
        const result = await apiEffectRunner(
          'username',
          'checkUsername',
          { urlParams: { username: value } }
        )
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
      const check = await apiEffectRunner(
        'username',
        'checkUsername',
        { urlParams: { username } }
      )
      if (!check.available) {
        setValidation({
          _tag: 'Unavailable',
          reason: t('username.notAvailable'),
        })
        return
      }

      const result = await saveUsername(username)
      if (result.success) {
        router.replace('/(app)/(tabs)')
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

  const handleBack = async () => {
    await logout()
  }

  const getValidationIcon = () =>
    pipe(
      Match.value(validation),
      Match.when({ _tag: 'Available' }, () => (
        <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
          <MaterialIcons name="check" size={20} color={iconColors.primary} />
        </View>
      )),
      Match.when({ _tag: 'Invalid' }, () => (
        <View className="w-8 h-8 rounded-full bg-error/10 items-center justify-center">
          <MaterialIcons name="close" size={20} color={iconColors.error} />
        </View>
      )),
      Match.when({ _tag: 'Unavailable' }, () => (
        <View className="w-8 h-8 rounded-full bg-error/10 items-center justify-center">
          <MaterialIcons name="close" size={20} color={iconColors.error} />
        </View>
      )),
      Match.when({ _tag: 'Checking' }, () => (
        <View className="w-8 h-8 rounded-full bg-border items-center justify-center">
          <MaterialIcons
            name="more-horiz"
            size={20}
            color={iconColors.textMuted}
          />
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
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Decorative background elements */}
      <View className="absolute top-0 right-0 w-[80%] h-[60%] bg-primary/5 dark:bg-primary/10 rounded-full -translate-y-1/4 translate-x-1/4" />
      <View className="absolute bottom-0 left-0 w-[50%] h-[40%] bg-primary/5 dark:bg-primary/10 rounded-full translate-y-1/4 -translate-x-1/4" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-4 pb-8 justify-between">
            {/* Top Navigation */}
            <View className="flex-row items-center py-2">
              <IconButton
                icon="chevron-left"
                size={24}
                color={iconColors.textPrimary}
                onPress={handleBack}
              />
            </View>

            {/* Main Content */}
            <View className="flex-1 pt-8">
              {/* Headline */}
              <View className="mb-10">
                <Text className="text-[28px] font-bold text-text-primary dark:text-white">
                  {t('username.headlinePartOne')}
                </Text>
                <Text className="text-[28px] font-bold text-primary">
                  {t('username.headlinePartTwo')}
                </Text>
                <Text className="text-base font-regular text-text-secondary dark:text-slate-400 mt-3">
                  {t('username.description')}
                </Text>
              </View>

              {/* Username Input */}
              <View className="w-full">
                <View className="flex-row items-center w-full h-14 rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-surface-dark px-5">
                  {/* Fixed Prefix */}
                  <Text className="text-lg font-medium text-text-muted dark:text-slate-400 mr-1">
                    @
                  </Text>
                  {/* Input */}
                  <TextInput
                    className="flex-1 text-lg font-semibold text-text-primary dark:text-white"
                    placeholder={t('username.placeholder')}
                    placeholderTextColor={iconColors.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={MAX_USERNAME_LENGTH}
                  />
                  {/* Status Icon */}
                  {getValidationIcon()}
                </View>

                {/* Helper Text & Counter */}
                <View className="flex-row justify-between items-center px-2 mt-3">
                  {getValidationStatus()}
                  <Text className="text-sm font-medium text-text-muted dark:text-slate-500">
                    {username.length}/{MAX_USERNAME_LENGTH}
                  </Text>
                </View>
              </View>
            </View>

            {/* Bottom Actions */}
            <View className="gap-5 pt-10">
              {/* Primary Button */}
              <Button
                icon="arrow-forward"
                loading={loading}
                disabled={validation._tag !== 'Available'}
                onPress={handleSubmit}
              >
                {t('username.continueButton')}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
