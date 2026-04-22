import { BlurView } from 'expo-blur'
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
import { MeshBackground } from '@/components'
import { Button, Input } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useThemeContext } from '@/contexts/ThemeContext'
import { useLocalization } from '@/hooks/useLocalization'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login } = useAuth()
  const router = useRouter()
  const { t, language } = useLocalization()
  const { isDark } = useThemeContext()

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
          {/* Hero Section — top half breathes */}
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-6xl mb-4">🌿</Text>
            <Text
              className="text-4xl text-white text-center mb-3"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            >
              {t('auth:login.title')}
            </Text>
            <Text
              className="text-base text-white/70 text-center leading-relaxed max-w-[280px]"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
            >
              {t('auth:login.subtitle')}
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
                <Input
                  testID="login-email-input"
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
                  <Text className="text-error text-sm font-medium px-4 -mt-2">
                    {error}
                  </Text>
                )}

                <Button
                  testID="login-submit-button"
                  icon="arrow-forward"
                  loading={loading}
                  onPress={handleSubmit}
                  pill
                >
                  {t('auth:login.submitButton')}
                </Button>
              </View>

              <Text
                className="text-[11px] text-white/50 text-center mt-4 leading-relaxed"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                {t('auth:login.termsNotice')}
              </Text>
            </BlurView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </MeshBackground>
  )
}
