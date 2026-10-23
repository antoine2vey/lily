import * as AppleAuthentication from 'expo-apple-authentication'
import { SymbolView } from 'expo-symbols'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, Pressable } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocalization } from '@/hooks/useLocalization'

type Props = {
  onError?: (message: string) => void
}

/** Sign in with Apple exists only on iOS devices that support it. */
export function useAppleSignInAvailable() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false))
  }, [])

  return available
}

/**
 * Logo-only "Sign in with Apple" button (iOS only), in the white style the HIG
 * allows for custom buttons. Full name + email are returned only on first
 * authorization — subsequent sign-ins return only the stable `sub`, which our
 * backend uses to look up the linked user.
 */
export function AppleSignInButton({ onError }: Props) {
  const { signInWithOAuth } = useAuth()
  const { t } = useLocalization()
  const iconColors = useIconColors()
  const [loading, setLoading] = useState(false)

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
    <Pressable
      testID="apple-sign-in-button"
      accessibilityRole="button"
      accessibilityLabel={t('auth:login.appleButton')}
      onPress={handlePress}
      disabled={loading}
      className="w-14 h-14 rounded-full bg-white/15 border border-white/25 items-center justify-center active:bg-white/25"
    >
      {loading ? (
        <ActivityIndicator color={iconColors.white} />
      ) : (
        <SymbolView name="apple.logo" size={24} tintColor={iconColors.white} />
      )}
    </Pressable>
  )
}
