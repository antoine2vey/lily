import { Text, View } from 'react-native'
import {
  AppleSignInButton,
  useAppleSignInAvailable,
} from '@/components/auth/AppleSignInButton'
import {
  GoogleSignInButton,
  isGoogleSignInConfigured,
} from '@/components/auth/GoogleSignInButton'
import { useLocalization } from '@/hooks/useLocalization'

type Props = {
  onError: (message: string) => void
}

/** "or continue with" divider plus a row of provider buttons, or nothing when no provider is available. */
export function SocialSignIn({ onError }: Props) {
  const { t } = useLocalization()
  const appleAvailable = useAppleSignInAvailable()

  if (!appleAvailable && !isGoogleSignInConfigured) return null

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 h-px bg-white/20" />
        <Text
          className="text-[11px] text-white/70 uppercase tracking-wide"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {t('auth:login.orContinueWith')}
        </Text>
        <View className="flex-1 h-px bg-white/20" />
      </View>

      <View className="flex-row justify-center gap-4">
        {appleAvailable && <AppleSignInButton onError={onError} />}
        <GoogleSignInButton onError={onError} />
      </View>
    </View>
  )
}
