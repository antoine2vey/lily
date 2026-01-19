import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { Button, IconButton, Input, TextLink } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { colors } from 'src/theme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email')
      return
    }

    setLoading(true)
    setError(null)

    const result = await login(email.trim())

    setLoading(false)

    if (result.success) {
      router.push('/(auth)/check-email')
    } else {
      setError(result.error ?? 'Failed to send magic link')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background-light dark:bg-background-dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Navigation */}
          <View className="flex-row items-center justify-between p-4 pt-6">
            <IconButton
              icon="arrow-back-ios-new"
              color={colors.textMain}
              onPress={() => router.back()}
            />
          </View>

          {/* Main Content */}
          <View className="flex-1 px-6 max-w-md w-full mx-auto">
            {/* Header Section */}
            <View className="mt-8 mb-10 items-center">
              <Text
                className="text-3xl text-center text-zinc-900 dark:text-white mb-3"
                style={{ fontFamily: 'PlusJakartaSans_800ExtraBold' }}
              >
                Let's grow together
              </Text>
              <Text
                className="text-base text-center text-zinc-500 dark:text-zinc-400"
                style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
              >
                Enter your email to get started.{'\n'}We'll send you a magic
                link.
              </Text>
            </View>

            {/* Form Section */}
            <View className="w-full gap-6">
              {/* Email Input */}
              <View>
                <Input
                  icon="eco"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text)
                    setError(null)
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  error={!!error}
                />
                {error && (
                  <Text
                    className="text-red-500 text-sm mt-2 px-4"
                    style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
                  >
                    {error}
                  </Text>
                )}
              </View>

              {/* Submit Button */}
              <Button
                icon="arrow-forward"
                loading={loading}
                onPress={handleSubmit}
              >
                Send Magic Link
              </Button>

              {/* Optional Link */}
              <View className="items-center mt-2">
                <TextLink variant="secondary" onPress={() => {}}>
                  Log in with password instead
                </TextLink>
              </View>
            </View>
          </View>

          {/* Bottom Illustration */}
          <View className="relative w-full h-64 mt-auto items-end justify-center overflow-hidden">
            {/* Abstract organic shape background */}
            <View className="absolute bottom-0 w-full h-48 bg-primary/10 rounded-t-full blur-3xl" />
            {/* Placeholder for plant illustration */}
            <View className="w-full h-full items-center justify-end pb-4 opacity-90">
              <MaterialIcons
                name="local-florist"
                size={120}
                color={colors.primary}
                style={{ opacity: 0.3 }}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
