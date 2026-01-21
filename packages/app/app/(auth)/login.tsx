import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { images } from 'src/assets/images'
import { Button, IconButton, Input } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { iconColors } from 'src/theme'

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
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Navigation */}
          <View className="flex-row items-center p-4">
            <IconButton
              icon="chevron-left"
              size={24}
              color={iconColors.textPrimary}
              onPress={() => router.back()}
            />
          </View>

          {/* Main Content */}
          <View className="flex-1 px-6">
            {/* Header Section */}
            <View className="mt-4 mb-8">
              <Text className="text-[28px] font-bold text-text-primary mb-2">
                Let's grow together
              </Text>
              <Text className="text-base font-regular text-text-secondary">
                Enter your email to get started.{'\n'}We'll send you a magic
                link.
              </Text>
            </View>

            {/* Form Section */}
            <View className="w-full gap-4">
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
                  <Text className="text-error text-sm font-medium mt-2 px-4">
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
            </View>
          </View>

          {/* Bottom Illustration */}
          <View className="w-full h-56 mt-auto overflow-hidden">
            <Image
              source={images.plantsIllustration}
              className="w-full h-full"
              resizeMode="cover"
              style={{ opacity: 0.9 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
