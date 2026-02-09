import { MaterialIcons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Array, Option, pipe, Record } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIconColors } from 'src/hooks/useIconColors'

export interface CustomBottomTabBarProps
  extends Pick<BottomTabBarProps, 'state' | 'descriptors' | 'navigation'> {
  onFabPress: () => void
}

type TabIconName = keyof typeof MaterialIcons.glyphMap

const iconMap: Record.ReadonlyRecord<
  string,
  { active: TabIconName; inactive: TabIconName }
> = {
  // Expo Router uses file names as route names
  index: { active: 'home', inactive: 'home' },
  plants: { active: 'local-florist', inactive: 'local-florist' },
  care: { active: 'water-drop', inactive: 'water-drop' },
  profile: { active: 'person', inactive: 'person-outline' },
  // Legacy route names for compatibility
  Home: { active: 'home', inactive: 'home' },
  Plants: { active: 'local-florist', inactive: 'local-florist' },
  Care: { active: 'water-drop', inactive: 'water-drop' },
  Profile: { active: 'person', inactive: 'person-outline' },
}

const defaultIcons = {
  active: 'help' as TabIconName,
  inactive: 'help-outline' as TabIconName,
}

const getTabIcon = (routeName: string, focused: boolean): TabIconName => {
  const icons = pipe(
    Record.get(iconMap, routeName),
    Option.getOrElse(() => defaultIcons)
  )
  return focused ? icons.active : icons.inactive
}

export function BottomTabBar({
  state,
  descriptors,
  navigation,
  onFabPress,
}: CustomBottomTabBarProps) {
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()

  return (
    <View
      className="bg-white dark:bg-surface-dark border-t border-border dark:border-slate-700"
      style={{
        paddingBottom: insets.bottom,
        height: 64 + insets.bottom,
      }}
    >
      {/* FAB - positioned absolutely in center, floating above */}
      <Pressable
        onPress={onFabPress}
        className="absolute self-center -top-7 w-14 h-14 rounded-full items-center justify-center z-10 bg-primary"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 8,
        }}
      >
        <MaterialIcons name="add" size={28} color={iconColors.white} />
      </Pressable>

      {/* Tab bar row */}
      <View className="flex-row flex-1 items-end">
        {Array.map(state.routes, (route, index) => {
          const { options } = descriptors[route.key]
          const label = pipe(
            Option.fromNullable(options.tabBarLabel),
            Option.map((v) => String(v)),
            Option.orElse(() => Option.fromNullable(options.title)),
            Option.getOrElse(() => route.name)
          )

          const isFocused = state.index === index
          const iconName = getTabIcon(route.name, isFocused)
          const colorClass = isFocused
            ? 'text-primary font-bold'
            : 'text-slate-400 font-semibold'

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              className="flex-1 items-center justify-end pb-2 gap-1.5"
            >
              <MaterialIcons
                name={iconName}
                size={26}
                color={isFocused ? iconColors.primary : '#9ca3af'}
              />
              <Text className={`text-[11px] ${colorClass}`}>{label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
