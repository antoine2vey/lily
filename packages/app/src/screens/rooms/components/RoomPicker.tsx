import { MaterialIcons } from '@expo/vector-icons'
import { isRoomCompatibleWithPlant, luxToLuminosityLevel } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRooms } from 'src/hooks/useRooms'

interface RoomPickerProps {
  value: string | null
  onSelect: (roomId: string | null) => void
  plantLuxNeeded?: number
}

export function RoomPicker({
  value,
  onSelect,
  plantLuxNeeded,
}: RoomPickerProps) {
  const { t } = useTranslation('rooms')
  const { data: rooms } = useRooms()

  const roomsList = Option.getOrElse(
    Option.fromNullable(rooms),
    () => [] as NonNullable<typeof rooms>
  )

  if (Array.isEmptyReadonlyArray(roomsList)) {
    return null
  }

  const selectedRoom = pipe(
    Option.fromNullable(value),
    Option.flatMap((id) => Array.findFirst(roomsList, (room) => room.id === id))
  )

  const getCompatibility = (roomLuminosity: number | null) =>
    pipe(
      Option.fromNullable(plantLuxNeeded),
      Option.flatMap((lux) => isRoomCompatibleWithPlant(roomLuminosity, lux))
    )

  const getChipBorderClass = (
    roomLuminosity: number | null,
    isSelected: boolean
  ): string => {
    if (isSelected) return ''
    if (Option.isNone(Option.fromNullable(plantLuxNeeded)))
      return 'border border-border dark:border-slate-700'

    return pipe(
      getCompatibility(roomLuminosity),
      Option.match({
        onNone: () => 'border border-border dark:border-slate-700',
        onSome: (compatible) =>
          pipe(
            Match.value(compatible),
            Match.when(true, () => 'border border-primary'),
            Match.when(false, () => 'border border-warning'),
            Match.exhaustive
          ),
      })
    )
  }

  const getIndicatorIcon = (
    roomLuminosity: number | null
  ): React.ReactNode | null => {
    if (Option.isNone(Option.fromNullable(plantLuxNeeded))) return null

    return pipe(
      getCompatibility(roomLuminosity),
      Option.match({
        onNone: () => <Text className="text-xs text-text-muted">?</Text>,
        onSome: (compatible) =>
          pipe(
            Match.value(compatible),
            Match.when(true, () => (
              <MaterialIcons name="check" size={14} color="#5B8C5A" />
            )),
            Match.when(false, () => (
              <MaterialIcons name="warning" size={14} color="#F59E0B" />
            )),
            Match.exhaustive
          ),
      })
    )
  }

  const renderBanner = () =>
    pipe(
      selectedRoom,
      Option.flatMap((room) =>
        pipe(
          Option.fromNullable(plantLuxNeeded),
          Option.map((lux) => ({ room, lux }))
        )
      ),
      Option.match({
        onNone: () => null,
        onSome: ({ room, lux }) =>
          pipe(
            isRoomCompatibleWithPlant(room.luminosity, lux),
            Option.match({
              onNone: () => (
                <View className="mt-2 p-3 rounded-lg bg-info/10 flex-row items-start gap-2">
                  <MaterialIcons
                    name="info-outline"
                    size={18}
                    color="#3B82F6"
                  />
                  <Text className="text-sm text-info flex-1 flex-shrink">
                    {t('lightUnknown')}
                  </Text>
                </View>
              ),
              onSome: (compatible) =>
                pipe(
                  Match.value(compatible),
                  Match.when(true, () => null),
                  Match.when(false, () => {
                    const roomLux = Option.getOrElse(
                      Option.fromNullable(room.luminosity),
                      () => 0
                    )
                    const roomLevel = luxToLuminosityLevel(roomLux)
                    const plantLevel = luxToLuminosityLevel(lux)
                    const roomLabel = t(`lightingLevels.${roomLevel}`).replace(
                      '\n',
                      ' '
                    )
                    const plantLabel = t(
                      `lightingLevels.${plantLevel}`
                    ).replace('\n', ' ')
                    return (
                      <View className="mt-2 p-3 rounded-lg bg-warning/10 flex-row items-start gap-2">
                        <MaterialIcons
                          name="warning"
                          size={18}
                          color="#F59E0B"
                        />
                        <Text className="text-sm text-warning flex-1 flex-shrink">
                          {t('lightWarning', {
                            roomLight: roomLabel.toLowerCase(),
                            plantLight: plantLabel.toLowerCase(),
                          })}
                        </Text>
                      </View>
                    )
                  }),
                  Match.exhaustive
                ),
            })
          ),
      })
    )

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
                  : `bg-white dark:bg-surface-dark ${getChipBorderClass(room.luminosity, isSelected)}`
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
              {!isSelected && getIndicatorIcon(room.luminosity)}
            </Pressable>
          )
        })}
      </ScrollView>

      {renderBanner()}
    </View>
  )
}
