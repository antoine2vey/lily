import { View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

interface SlideTextContentProps {
  title: string
  subtitle: string
}

export function SlideTextContent({ title, subtitle }: SlideTextContentProps) {
  return (
    <View className="pb-8">
      <Animated.Text
        entering={FadeIn.delay(200).duration(400)}
        className="text-3xl text-white text-center mb-3"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {title}
      </Animated.Text>
      <Animated.Text
        entering={FadeIn.delay(400).duration(400)}
        className="text-base text-white/70 text-center leading-relaxed max-w-[300px] self-center"
        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
      >
        {subtitle}
      </Animated.Text>
    </View>
  )
}
