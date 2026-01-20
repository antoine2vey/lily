import { MaterialIcons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Array } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts } from 'src/theme'

interface CustomBottomTabBarProps extends BottomTabBarProps {
  onFabPress: () => void
}

type TabIconName = keyof typeof MaterialIcons.glyphMap

const getTabIcon = (routeName: string, focused: boolean): TabIconName => {
  const iconMap: Record<
    string,
    { active: TabIconName; inactive: TabIconName }
  > = {
    Home: { active: 'home', inactive: 'home' },
    Plants: { active: 'local-florist', inactive: 'local-florist' },
    Care: { active: 'water-drop', inactive: 'water-drop' },
    Profile: { active: 'person', inactive: 'person-outline' },
  }

  const icons = iconMap[routeName] || {
    active: 'help',
    inactive: 'help-outline',
  }
  return focused ? icons.active : icons.inactive
}

export function BottomTabBar({
  state,
  descriptors,
  navigation,
  onFabPress,
}: CustomBottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const middleIndex = Math.floor(state.routes.length / 2)

  return (
    <View
      className="flex-row bg-white border-t border-border items-end"
      style={{
        paddingBottom: insets.bottom,
        height: 64 + insets.bottom,
      }}
    >
      {Array.map(state.routes, (route, index) => {
        const { options } = descriptors[route.key]
        const label =
          options.tabBarLabel !== undefined
            ? String(options.tabBarLabel)
            : options.title !== undefined
              ? options.title
              : route.name

        const isFocused = state.index === index
        const iconName = getTabIcon(route.name, isFocused)

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

        if (index === middleIndex) {
          return (
            <View
              key="fab-spacer"
              className="flex-1 items-center justify-end pb-2"
            >
              <Pressable
                onPress={onFabPress}
                className="absolute -top-5 w-14 h-14 rounded-full items-center justify-center"
                style={{
                  backgroundColor: colors.primary,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 10,
                  elevation: 8,
                }}
              >
                <MaterialIcons name="add" size={28} color={colors.white} />
              </Pressable>
            </View>
          )
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            className="flex-1 items-center justify-end pb-2"
          >
            <MaterialIcons
              name={iconName}
              size={24}
              color={isFocused ? colors.primary : colors.textMuted}
            />
            <Text
              className="text-[10px] mt-1"
              style={{
                fontFamily: fonts.medium,
                color: isFocused ? colors.primary : colors.textMuted,
              }}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
