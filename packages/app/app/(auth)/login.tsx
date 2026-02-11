import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, IconButton, Input } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { useLocalization } from 'src/hooks/useLocalization'
import { iconColors } from 'src/theme'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login } = useAuth()
  const router = useRouter()
  const { t, language } = useLocalization()

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError(t('auth:login.emailRequired'))
      return
    }

    setLoading(true)
    setError(null)

    const result = await login(email.trim(), language)

    setLoading(false)

    if (result.success) {
      router.push('/(auth)/check-email')
    } else {
      setError(result.error ?? t('auth:login.failedToSend'))
    }
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
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
            <View className="mt-8 mb-10 items-center">
              <Text className="text-3xl font-extrabold tracking-tight text-text-primary dark:text-white text-center mb-3">
                {t('auth:login.title')}
              </Text>
              <Text className="text-base font-medium text-text-muted dark:text-slate-400 text-center leading-relaxed">
                {t('auth:login.subtitle')}
              </Text>
            </View>

            {/* Form Section */}
            <View className="w-full gap-6">
              {/* Email Input */}
              <View>
                <Input
                  icon="eco"
                  placeholder={t('auth:login.emailPlaceholder')}
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
                  pill
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
                pill
              >
                {t('auth:login.submitButton')}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
