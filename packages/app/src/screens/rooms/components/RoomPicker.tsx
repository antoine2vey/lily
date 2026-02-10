import { Array, Option } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRooms } from 'src/hooks/useRooms'

interface RoomPickerProps {
  value: string | null
  onSelect: (roomId: string | null) => void
}

export function RoomPicker({ value, onSelect }: RoomPickerProps) {
  const { t } = useTranslation('rooms')
  const { data: rooms } = useRooms()

  const roomsList = Option.getOrElse(
    Option.fromNullable(rooms),
    () => [] as NonNullable<typeof rooms>
  )

  if (Array.isEmptyReadonlyArray(roomsList)) {
    return null
  }

  return (
    <View className="gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {/* No Room option */}
        <Pressable
          onPress={() => onSelect(null)}
          className={`h-9 px-4 rounded-full flex-row items-center gap-1.5 ${
            value === null
              ? 'bg-primary'
              : 'bg-white dark:bg-surface-dark border border-border dark:border-slate-700'
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              value === null
                ? 'text-white'
                : 'text-text-primary dark:text-white'
            }`}
          >
            {t('filter.noRoom')}
          </Text>
        </Pressable>

        {/* Room options */}
        {Array.map(roomsList, (room) => {
          const isSelected = value === room.id
          return (
            <Pressable
              key={room.id}
              onPress={() => onSelect(room.id)}
              className={`h-9 px-4 rounded-full flex-row items-center gap-1.5 ${
                isSelected
                  ? 'bg-primary'
                  : 'bg-white dark:bg-surface-dark border border-border dark:border-slate-700'
              }`}
            >
              <Text className="text-sm">{room.icon}</Text>
              <Text
                className={`text-sm font-medium ${
                  isSelected
                    ? 'text-white'
                    : 'text-text-primary dark:text-white'
                }`}
              >
                {room.name}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
