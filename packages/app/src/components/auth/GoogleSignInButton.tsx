import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text } from 'react-native'
import { GoogleLogo } from '@/components/auth/GoogleLogo'
import { useAuth } from '@/contexts/AuthContext'
import { useLocalization } from '@/hooks/useLocalization'

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID

type Props = {
  onError?: (message: string) => void
}

/**
 * "Continue with Google" button — uses the React Native Google Sign-In SDK.
 * The SDK opens the native Google chooser sheet and returns an ID token that
 * our backend verifies via JWKS before issuing our own JWT pair.
 */
export function GoogleSignInButton({ onError }: Props) {
  const { signInWithOAuth } = useAuth()
  const { t } = useLocalization()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) return
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    })
  }, [])

  if (!GOOGLE_WEB_CLIENT_ID) return null

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
      onPress={handlePress}
      disabled={loading}
      className={`w-full h-[52px] rounded-full bg-white border border-border flex-row items-center justify-center gap-3 ${loading ? 'opacity-70' : ''}`}
      style={({ pressed }) => ({
        transform: [{ scale: pressed && !loading ? 0.98 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color="#1A1A1A" />
      ) : (
        <>
          <GoogleLogo size={20} />
          <Text
            className="text-base text-text-primary"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('auth:login.googleButton')}
          </Text>
        </>
      )}
    </Pressable>
  )
}
