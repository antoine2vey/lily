import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Text, View } from 'react-native'

interface Feature {
  title: string
  description: string
}

interface FeatureListProps {
  features: Feature[]
}

export function FeatureList({ features }: FeatureListProps) {
  return (
    <View className="mx-4 p-6 rounded-3xl bg-surface dark:bg-surface-dark shadow-lg border border-border/30 dark:border-slate-700/30">
      <View className="gap-5">
        {pipe(
          features,
          Array.map((feature) => (
            <View key={feature.title} className="flex-row items-start gap-4">
              <View className="w-6 h-6 rounded-full items-center justify-center mt-0.5 bg-primary">
                <MaterialIcons name="check" size={14} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-sm mb-1 font-bold text-text-primary dark:text-white">
                  {feature.title}
                </Text>
                <Text className="text-xs font-regular text-text-muted dark:text-slate-400">
                  {feature.description}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  )
}
