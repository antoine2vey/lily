import { Text, View } from 'react-native'

interface OnboardingHeroProps {
  emoji: string
  title: string
  subtitle: string
}

export function OnboardingHero({
  emoji,
  title,
  subtitle,
}: OnboardingHeroProps) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-6xl mb-4">{emoji}</Text>
      <Text
        className="text-4xl text-white text-center mb-3"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {title}
      </Text>
      <Text
        className="text-base text-white/70 text-center leading-relaxed max-w-[280px]"
        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
      >
        {subtitle}
      </Text>
    </View>
  )
}
