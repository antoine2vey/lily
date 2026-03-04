import { MaterialIcons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Array, Option, pipe, Record } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIconColors } from 'src/hooks/useIconColors'

export interface CustomBottomTabBarProps
  extends Pick<BottomTabBarProps, 'state' | 'descriptors' | 'navigation'> {
  onFabPress: () => void
  careBadgeCount?: number
}

type TabIconName = keyof typeof MaterialIcons.glyphMap

interface TabIconConfig {
  active: TabIconName
  inactive: TabIconName
  hasBadge?: boolean
}

const iconMap: Record.ReadonlyRecord<string, TabIconConfig> = {
  // Expo Router uses file names as route names
  index: { active: 'home', inactive: 'home' },
  plants: { active: 'local-florist', inactive: 'local-florist' },
  care: { active: 'water-drop', inactive: 'water-drop', hasBadge: true },
  profile: { active: 'person', inactive: 'person-outline' },
  // Legacy route names for compatibility
  Home: { active: 'home', inactive: 'home' },
  Plants: { active: 'local-florist', inactive: 'local-florist' },
  Care: { active: 'water-drop', inactive: 'water-drop', hasBadge: true },
  Profile: { active: 'person', inactive: 'person-outline' },
}

const defaultIcons: TabIconConfig = {
  active: 'help' as TabIconName,
  inactive: 'help-outline' as TabIconName,
}

const getTabConfig = (routeName: string): TabIconConfig =>
  pipe(
    Record.get(iconMap, routeName),
    Option.getOrElse(() => defaultIcons)
  )

export function BottomTabBar({
  state,
  descriptors,
  navigation,
  onFabPress,
  careBadgeCount = 0,
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
          const tabConfig = getTabConfig(route.name)
          const iconName = isFocused ? tabConfig.active : tabConfig.inactive
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

          const badgeCount = pipe(
            Option.fromNullable(tabConfig.hasBadge),
            Option.map(() => careBadgeCount),
            Option.getOrElse(() => 0)
          )

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              className="flex-1 items-center justify-end pb-2 gap-1.5"
            >
              <View className="relative">
                <MaterialIcons
                  name={iconName}
                  size={26}
                  color={isFocused ? iconColors.primary : '#9ca3af'}
                />
                {badgeCount > 0 && (
                  <View className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-error items-center justify-center px-0.5">
                    <Text className="text-white text-[10px] font-bold leading-none">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text className={`text-[11px] ${colorClass}`}>{label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
