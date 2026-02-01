import { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Dimensions, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

const { width } = Dimensions.get('window')

interface OnboardingSlideProps {
  icon: ComponentProps<typeof MaterialIcons>['name']
  title: string
  description: string
  iconColor?: string
}

export function OnboardingSlide({
  icon,
  title,
  description,
  iconColor,
}: OnboardingSlideProps) {
  const iconColors = useIconColors()
  const resolvedIconColor = iconColor ?? iconColors.primary
  return (
    <View style={{ width }} className="flex-1 items-center px-8 pt-16">
      {/* Illustration placeholder */}
      <View className="w-64 h-64 rounded-3xl items-center justify-center mb-12 bg-surface-tinted dark:bg-slate-800">
        <MaterialIcons name={icon} size={120} color={resolvedIconColor} />
      </View>

      {/* Title */}
      <Text className="text-2xl text-center mb-4 font-bold text-text-primary dark:text-white">
        {title}
      </Text>

      {/* Description */}
      <Text className="text-base text-center font-regular text-text-secondary dark:text-slate-400 leading-6">
        {description}
      </Text>
    </View>
  )
}
