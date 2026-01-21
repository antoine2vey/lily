import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe } from 'effect'
import { Image, Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface AvatarPickerProps {
  avatarUrl: Option.Option<string>
  name: string
  onPress: () => void
}

export function AvatarPicker({ avatarUrl, name, onPress }: AvatarPickerProps) {
  return (
    <View className="items-center py-6">
      <Pressable onPress={onPress}>
        <View className="relative">
          {/* Avatar */}
          <View className="w-24 h-24 rounded-full items-center justify-center border-[3px] border-primary">
            {pipe(
              avatarUrl,
              Option.match({
                onNone: () => (
                  <View className="w-full h-full rounded-full items-center justify-center bg-primary-tint">
                    <Text className="text-3xl font-bold text-primary">
                      {name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                ),
                onSome: (url) => (
                  <Image
                    source={{ uri: url }}
                    className="w-full h-full rounded-full"
                    resizeMode="cover"
                  />
                ),
              })
            )}
          </View>

          {/* Edit badge */}
          <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center bg-surface border-2 border-primary">
            <MaterialIcons name="edit" size={16} color={iconColors.primary} />
          </View>
        </View>
      </Pressable>

      {/* Change Photo text */}
      <Pressable onPress={onPress} className="mt-3">
        <Text className="text-sm font-semibold text-primary">Change Photo</Text>
      </Pressable>
    </View>
  )
}
