import { MaterialIcons } from '@expo/vector-icons'
import { Match, Option, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { ProgressBar } from 'src/components/ProgressBar'
import { useIconColors } from 'src/hooks/useIconColors'

type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

interface AchievementCardProps {
  achievement: {
    key: string
    name: string
    description: string
    icon: string
    unlocked: boolean
    progress?: number | null
    maxProgress?: number | null
    rarity: Rarity
  }
  onPress: () => void
}

const getRarityColor = (
  rarity: Rarity,
  iconColors: ReturnType<typeof useIconColors>
): string =>
  pipe(
    Match.value(rarity),
    Match.when('common', () => '#9CA3AF'),
    Match.when('rare', () => iconColors.info),
    Match.when('epic', () => '#8B5CF6'),
    Match.when('legendary', () => iconColors.achievementGold),
    Match.exhaustive
  )

const getIconName = (icon: string): keyof typeof MaterialIcons.glyphMap => {
  const iconMap: Record<string, keyof typeof MaterialIcons.glyphMap> = {
    seedling: 'eco',
    'potted-plant': 'local-florist',
    garden: 'park',
    water: 'water-drop',
    heart: 'favorite',
    fire: 'local-fire-department',
    trophy: 'emoji-events',
    robot: 'smart-toy',
    chat: 'chat',
    star: 'star',
  }
  return Option.getOrElse(
    Option.fromNullable(iconMap[icon]),
    () => 'star' as const
  )
}

export function AchievementCard({
  achievement,
  onPress,
}: AchievementCardProps) {
  const iconColors = useIconColors()
  const rarityColor = getRarityColor(achievement.rarity, iconColors)
  const iconName = getIconName(achievement.icon)
  const hasProgress =
    achievement.progress != null && achievement.maxProgress != null
  const progressValue = hasProgress
    ? Option.getOrElse(Option.fromNullable(achievement.progress), () => 0) /
      Option.getOrElse(Option.fromNullable(achievement.maxProgress), () => 1)
    : 0

  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 p-4 rounded-2xl m-1 ${achievement.unlocked ? 'bg-surface dark:bg-surface-dark' : 'bg-background dark:bg-background-dark border border-border dark:border-slate-700'}`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : achievement.unlocked ? 1 : 0.7,
      })}
    >
      <View className="items-center">
        {/* Icon */}
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-3"
          style={{
            backgroundColor: achievement.unlocked
              ? `${rarityColor}20`
              : iconColors.surfaceTinted,
          }}
        >
          {achievement.unlocked ? (
            <MaterialIcons name={iconName} size={28} color={rarityColor} />
          ) : (
            <MaterialIcons name="lock" size={24} color={iconColors.textMuted} />
          )}
        </View>

        {/* Name */}
        <Text
          className={`text-sm text-center font-semibold ${achievement.unlocked ? 'text-text-primary dark:text-white' : 'text-text-muted dark:text-slate-400'}`}
          numberOfLines={1}
        >
          {achievement.name}
        </Text>

        {/* Description */}
        <Text
          className="text-xs text-center mt-1 font-regular text-text-muted dark:text-slate-400"
          numberOfLines={2}
        >
          {achievement.description}
        </Text>

        {/* Progress bar for locked achievements with progress */}
        {!achievement.unlocked && hasProgress && (
          <View className="w-full mt-3">
            <ProgressBar
              progress={progressValue}
              height={4}
              color={rarityColor}
            />
            <Text className="text-xs text-center mt-1 font-regular text-text-muted dark:text-slate-400">
              {achievement.progress}/{achievement.maxProgress}
            </Text>
          </View>
        )}

        {/* Unlocked checkmark */}
        {achievement.unlocked && (
          <View className="absolute top-2 right-2 w-6 h-6 rounded-full items-center justify-center bg-primary">
            <MaterialIcons name="check" size={16} color={iconColors.white} />
          </View>
        )}
      </View>
    </Pressable>
  )
}
