import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface Feature {
  title: string
  description: string
}

interface FeatureListProps {
  features: Feature[]
}

export function FeatureList({ features }: FeatureListProps) {
  return (
    <View className="px-4">
      {pipe(
        features,
        Array.map((feature, index) => (
          <View
            key={feature.title}
            className={`flex-row items-start ${index === features.length - 1 ? '' : 'mb-4'}`}
          >
            <View className="w-6 h-6 rounded-full items-center justify-center mr-3 mt-0.5 bg-primary-tint">
              <MaterialIcons
                name="check"
                size={14}
                color={iconColors.primary}
              />
            </View>
            <View className="flex-1">
              <Text className="text-base mb-0.5 font-semibold text-text-primary">
                {feature.title}
              </Text>
              <Text className="text-sm font-regular text-text-muted">
                {feature.description}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}
