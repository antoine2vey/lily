import * as AppleAuthentication from 'expo-apple-authentication'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, View } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { useThemeContext } from '@/contexts/ThemeContext'

type Props = {
  onError?: (message: string) => void
}

/**
 * Native "Sign in with Apple" button (iOS only). Uses Apple's official styled
 * button per HIG. Full name + email are returned only on first authorization —
 * subsequent sign-ins return only the stable `sub`, which our backend uses to
 * look up the linked user.
 */
export function AppleSignInButton({ onError }: Props) {
  const { signInWithOAuth } = useAuth()
  const { isDark } = useThemeContext()
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false))
  }, [])

  if (Platform.OS !== 'ios' || !available) return null

  const handlePress = async () => {
    setLoading(true)
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      if (!credential.identityToken) {
        onError?.('Apple Sign-In returned no identity token')
        return
      }
      const result = await signInWithOAuth({
        provider: 'apple',
        idToken: credential.identityToken,
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName,
              familyName: credential.fullName.familyName,
            }
          : undefined,
      })
      if (!result.success) {
        onError?.(result.error ?? 'Apple Sign-In failed')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('ERR_REQUEST_CANCELED')) {
        onError?.(message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="w-full h-[52px] rounded-full overflow-hidden">
      {loading ? (
        <View className="flex-1 items-center justify-center bg-black/10">
          <ActivityIndicator />
        </View>
      ) : (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={28}
          style={{ width: '100%', height: 52 }}
          onPress={handlePress}
        />
      )}
    </View>
  )
}
