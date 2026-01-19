import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Button, IconButton, TextLink } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { colors } from 'src/theme'

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
    // In production, you'd check with the backend
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
      router.replace('/(app)')
    } else {
      setValidation({
        _tag: 'Unavailable',
        reason: result.error ?? 'Username is not available',
      })
    }
  }

  const handleSkip = () => {
    refreshUser()
    router.replace('/(app)')
  }

  const getValidationIcon = () =>
    pipe(
      Match.value(validation),
      Match.when({ _tag: 'Available' }, () => (
        <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
          <MaterialIcons name="check" size={20} color={colors.primary} />
        </View>
      )),
      Match.when({ _tag: 'Invalid' }, () => (
        <View className="w-8 h-8 rounded-full bg-red-500/10 items-center justify-center">
          <MaterialIcons name="close" size={20} color="#ef4444" />
        </View>
      )),
      Match.when({ _tag: 'Unavailable' }, () => (
        <View className="w-8 h-8 rounded-full bg-red-500/10 items-center justify-center">
          <MaterialIcons name="close" size={20} color="#ef4444" />
        </View>
      )),
      Match.when({ _tag: 'Checking' }, () => (
        <View className="w-8 h-8 rounded-full bg-zinc-100 items-center justify-center">
          <MaterialIcons
            name="more-horiz"
            size={20}
            color={colors.textSecondary}
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
          <Text
            className="text-xs text-primary uppercase"
            style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
          >
            Available
          </Text>
        </View>
      )),
      Match.when({ _tag: 'Invalid' }, ({ reason }) => (
        <Text
          className="text-xs text-red-500"
          style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
        >
          {reason}
        </Text>
      )),
      Match.when({ _tag: 'Unavailable' }, ({ reason }) => (
        <Text
          className="text-xs text-red-500"
          style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
        >
          {reason}
        </Text>
      )),
      Match.orElse(() => null)
    )

  return (
    <SafeAreaView className="flex-1 bg-background-light dark:bg-background-dark">
      {/* Decorative background elements */}
      <View className="absolute top-0 right-0 -z-10 w-[80%] h-[80%] bg-primary/10 rounded-full opacity-50 translate-x-1/3 -translate-y-1/3" />
      <View className="absolute bottom-0 left-0 -z-10 w-[60%] h-[60%] bg-yellow-100/30 dark:bg-yellow-900/10 rounded-full opacity-50 -translate-x-1/3 translate-y-1/3" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 max-w-md w-full mx-auto px-6 pt-6 pb-8 justify-between">
            {/* Top Navigation */}
            <View className="flex-row items-center justify-between py-2">
              <IconButton
                icon="chevron-left"
                size={28}
                color={colors.textMain}
                onPress={() => router.back()}
              />
              <View className="w-12" />
            </View>

            {/* Main Content */}
            <View className="flex-1 pt-8">
              {/* Headline */}
              <View className="mb-10">
                <Text
                  className="text-3xl text-text-main dark:text-white mb-3"
                  style={{ fontFamily: 'PlusJakartaSans_800ExtraBold' }}
                >
                  What should we{'\n'}
                  <Text className="text-primary">call you?</Text>
                </Text>
                <Text
                  className="text-lg text-text-secondary dark:text-zinc-400 max-w-[90%]"
                  style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
                >
                  This is how you'll appear to other plant parents in the
                  community.
                </Text>
              </View>

              {/* Username Input */}
              <View className="w-full">
                <View className="flex-row items-center w-full h-16 rounded-full border border-zinc-200 dark:border-zinc-700 bg-surface-light dark:bg-surface-dark px-6">
                  {/* Fixed Prefix */}
                  <Text
                    className="text-xl text-text-secondary/60 dark:text-zinc-500 mr-1"
                    style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
                  >
                    @
                  </Text>
                  {/* Input */}
                  <TextInput
                    className="flex-1 text-xl text-text-main dark:text-white"
                    style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
                    placeholder="username"
                    placeholderTextColor="#9ca3af"
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
                <View className="flex-row justify-between items-center px-6 mt-3">
                  {getValidationStatus()}
                  <Text
                    className="text-sm text-text-secondary dark:text-zinc-500"
                    style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
                  >
                    {username.length}/{MAX_USERNAME_LENGTH}
                  </Text>
                </View>
              </View>
            </View>

            {/* Bottom Actions */}
            <View className="gap-5 pb-4 pt-10">
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
