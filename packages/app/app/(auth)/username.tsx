import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, IconButton, TextLink } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { iconColors } from 'src/theme'

const MAX_USERNAME_LENGTH = 20
const MIN_USERNAME_LENGTH = 3

type ValidationState =
  | { _tag: 'Idle' }
  | { _tag: 'Checking' }
  | { _tag: 'Available' }
  | { _tag: 'Unavailable'; reason: string }
  | { _tag: 'Invalid'; reason: string }

export default function UsernameSetupScreen() {
  const [username, setUsername] = useState('')
  const [validation, setValidation] = useState<ValidationState>({
    _tag: 'Idle',
  })
  const [loading, setLoading] = useState(false)
  const { setUsername: saveUsername, refreshUser } = useAuth()
  const router = useRouter()

  const validateUsername = useCallback((value: string) => {
    if (value.length === 0) {
      setValidation({ _tag: 'Idle' })
      return
    }

    if (value.length < MIN_USERNAME_LENGTH) {
      setValidation({
        _tag: 'Invalid',
        reason: `Must be at least ${MIN_USERNAME_LENGTH} characters`,
      })
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setValidation({
        _tag: 'Invalid',
        reason: 'Only letters, numbers, and underscores',
      })
      return
    }

    // For now, assume available if valid format
    setValidation({ _tag: 'Available' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      validateUsername(username)
    }, 300)
    return () => clearTimeout(timer)
  }, [username, validateUsername])

  const handleSubmit = async () => {
    if (validation._tag !== 'Available' || loading) return

    setLoading(true)
    const result = await saveUsername(username)
    setLoading(false)

    if (result.success) {
      router.replace('/(app)/(tabs)')
    } else {
      setValidation({
        _tag: 'Unavailable',
        reason: result.error ?? 'Username is not available',
      })
    }
  }

  const handleSkip = () => {
    refreshUser()
    router.replace('/(app)/(tabs)')
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
            Available
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
      className="flex-1 bg-background"
    >
      {/* Decorative background elements */}
      <View className="absolute top-0 right-0 w-[80%] h-[60%] bg-primary/5 rounded-full -translate-y-1/4 translate-x-1/4" />
      <View className="absolute bottom-0 left-0 w-[50%] h-[40%] bg-primary/5 rounded-full translate-y-1/4 -translate-x-1/4" />

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
                onPress={() => router.back()}
              />
            </View>

            {/* Main Content */}
            <View className="flex-1 pt-8">
              {/* Headline */}
              <View className="mb-10">
                <Text className="text-[28px] font-bold text-text-primary">
                  What should we
                </Text>
                <Text className="text-[28px] font-bold text-primary">
                  call you?
                </Text>
                <Text className="text-base font-regular text-text-secondary mt-3">
                  This is how you'll appear to other{'\n'}plant parents in the
                  community.
                </Text>
              </View>

              {/* Username Input */}
              <View className="w-full">
                <View className="flex-row items-center w-full h-14 rounded-xl border border-border bg-surface px-5">
                  {/* Fixed Prefix */}
                  <Text className="text-lg font-medium text-text-muted mr-1">
                    @
                  </Text>
                  {/* Input */}
                  <TextInput
                    className="flex-1 text-lg font-semibold text-text-primary"
                    placeholder="username"
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
                  <Text className="text-sm font-medium text-text-muted">
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
                Continue
              </Button>

              {/* Secondary Link */}
              <View className="items-center">
                <TextLink variant="secondary" onPress={handleSkip}>
                  Skip for now
                </TextLink>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
