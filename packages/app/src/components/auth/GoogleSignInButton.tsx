import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable } from 'react-native'
import { GoogleLogo } from '@/components/auth/GoogleLogo'
import { useAuth } from '@/contexts/AuthContext'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocalization } from '@/hooks/useLocalization'

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID

export const isGoogleSignInConfigured = Boolean(GOOGLE_WEB_CLIENT_ID)

type Props = {
  onError?: (message: string) => void
}

/**
 * Logo-only "Continue with Google" button (light theme from Google's branding
 * guidelines) — uses the React Native Google Sign-In SDK.
 * The SDK opens the native Google chooser sheet and returns an ID token that
 * our backend verifies via JWKS before issuing our own JWT pair.
 */
export function GoogleSignInButton({ onError }: Props) {
  const { signInWithOAuth } = useAuth()
  const { t } = useLocalization()
  const iconColors = useIconColors()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) return
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    })
  }, [])

  if (!isGoogleSignInConfigured) return null

  const handlePress = async () => {
    setLoading(true)
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const response = await GoogleSignin.signIn()
      const idToken =
        'data' in response && response.data?.idToken
          ? response.data.idToken
          : null
      if (!idToken) {
        onError?.('Google Sign-In returned no ID token')
        return
      }
      const result = await signInWithOAuth({
        provider: 'google',
        idToken,
      })
      if (!result.success) {
        onError?.(result.error ?? 'Google Sign-In failed')
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code: string }).code
          : null
      if (code === statusCodes.SIGN_IN_CANCELLED) return
      const message = err instanceof Error ? err.message : String(err)
      console.log('Google Sign-In error:', message)
      onError?.(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Pressable
      testID="google-sign-in-button"
      accessibilityRole="button"
      accessibilityLabel={t('auth:login.googleButton')}
      onPress={handlePress}
      disabled={loading}
      className="w-14 h-14 rounded-full bg-white/15 border border-white/25 items-center justify-center active:bg-white/25"
    >
      {loading ? (
        <ActivityIndicator color={iconColors.white} />
      ) : (
        <GoogleLogo size={22} />
      )}
    </Pressable>
  )
}
