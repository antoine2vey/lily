import { Pressable, Text } from 'react-native'

interface GlassLinkProps {
  label: string
  onPress: () => void
  disabled?: boolean
  testID?: string
}

/** Quiet text action on the mesh background: skip, resend, change email. */
export function GlassLink({
  label,
  onPress,
  disabled,
  testID,
}: GlassLinkProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className={`py-2 items-center ${disabled ? 'opacity-50' : ''}`}
    >
      <Text
        className="text-sm text-white/75"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
