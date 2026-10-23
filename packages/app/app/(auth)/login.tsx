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
import { GlassCard, GlassInput, MascotHero, MeshBackground } from '@/components'
import { SocialSignIn } from '@/components/auth/SocialSignIn'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useLocalization } from '@/hooks/useLocalization'

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
            animation="hello"
            title={t('auth:login.title')}
            subtitle={t('auth:login.subtitle')}
          />

          <GlassCard style={{ marginTop: 32 }}>
            <View className="gap-3">
              <GlassInput
                testID="login-email-input"
                icon="mail-outline"
                error={!!error}
                placeholder={t('auth:login.emailPlaceholder')}
                accessibilityLabel={t('auth:login.emailLabel')}
                value={email}
                onChangeText={(text) => {
                  setEmail(text)
                  setError(null)
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
              {error && (
                <Text
                  className="text-sm text-white px-5"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
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

            <SocialSignIn onError={setError} />

            <Text
              className="text-[11px] text-white/60 text-center leading-relaxed px-4"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
            >
              {t('auth:login.termsNotice')}
            </Text>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </MeshBackground>
  )
}
