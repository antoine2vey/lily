import { MaterialIcons } from '@expo/vector-icons'
import { formatLongDate, parseApiDate } from '@lily/shared'
import { Match, Option, pipe } from 'effect'
import { Modal, Pressable, Text, View } from 'react-native'
import { ProgressBar } from 'src/components/ProgressBar'
import { iconColors } from 'src/theme'

type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt?: string
  progress?: number
  maxProgress?: number
  rarity: Rarity
}

interface AchievementDetailModalProps {
  visible: boolean
  onClose: () => void
  achievement: Achievement | null
}

const getRarityColor = (rarity: Rarity): string =>
  pipe(
    Match.value(rarity),
    Match.when('common', () => '#9CA3AF'),
    Match.when('rare', () => iconColors.info),
    Match.when('epic', () => '#8B5CF6'),
    Match.when('legendary', () => iconColors.achievementGold),
    Match.exhaustive
  )

const getRarityLabel = (rarity: Rarity): string =>
  pipe(
    Match.value(rarity),
    Match.when('common', () => 'Common'),
    Match.when('rare', () => 'Rare'),
    Match.when('epic', () => 'Epic'),
    Match.when('legendary', () => 'Legendary'),
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
  return iconMap[icon] ?? 'star'
}

const formatDate = (dateString: string): string =>
  pipe(
    parseApiDate(dateString),
    Option.map(formatLongDate),
    Option.getOrElse(() => 'Unknown')
  )

export function AchievementDetailModal({
  visible,
  onClose,
  achievement,
}: AchievementDetailModalProps) {
  if (!achievement) return null

  const rarityColor = getRarityColor(achievement.rarity)
  const iconName = getIconName(achievement.icon)
  const hasProgress =
    achievement.progress !== undefined && achievement.maxProgress !== undefined
  const progressValue = hasProgress
    ? (achievement.progress ?? 0) / (achievement.maxProgress ?? 1)
    : 0

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onPress={onClose}
      >
        <Pressable
          className="w-[85%] rounded-3xl p-6 bg-surface"
          onPress={() => {}}
        >
          {/* Close button */}
          <Pressable
            onPress={onClose}
            className="absolute top-4 right-4 w-8 h-8 items-center justify-center"
          >
            <MaterialIcons
              name="close"
              size={24}
              color={iconColors.textMuted}
            />
          </Pressable>

          {/* Icon */}
          <View className="items-center mt-4">
            <View
              className="w-24 h-24 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor: achievement.unlocked
                  ? `${rarityColor}20`
                  : iconColors.surfaceTinted,
              }}
            >
              {achievement.unlocked ? (
                <MaterialIcons name={iconName} size={48} color={rarityColor} />
              ) : (
                <MaterialIcons
                  name="lock"
                  size={40}
                  color={iconColors.textMuted}
                />
              )}
            </View>

            {/* Rarity badge */}
            <View
              className="px-3 py-1 rounded-full mb-3"
              style={{ backgroundColor: `${rarityColor}20` }}
            >
              <Text
                className="text-xs uppercase font-semibold"
                style={{ color: rarityColor }}
              >
                {getRarityLabel(achievement.rarity)}
              </Text>
            </View>

            {/* Name */}
            <Text className="text-xl text-center font-bold text-text-primary">
              {achievement.name}
            </Text>

            {/* Description */}
            <Text className="text-base text-center mt-2 font-regular text-text-secondary">
              {achievement.description}
            </Text>

            {/* Unlocked date or progress */}
            {achievement.unlocked ? (
              <View className="flex-row items-center mt-4">
                <MaterialIcons
                  name="check-circle"
                  size={18}
                  color={iconColors.primary}
                />
                <Text className="text-sm ml-2 font-medium text-primary">
                  Unlocked {formatDate(achievement.unlockedAt ?? '')}
                </Text>
              </View>
            ) : hasProgress ? (
              <View className="w-full mt-4">
                <ProgressBar
                  progress={progressValue}
                  height={8}
                  color={rarityColor}
                />
                <Text className="text-sm text-center mt-2 font-medium text-text-secondary">
                  {achievement.progress} / {achievement.maxProgress} completed
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center mt-4">
                <MaterialIcons
                  name="lock"
                  size={18}
                  color={iconColors.textMuted}
                />
                <Text className="text-sm ml-2 font-regular text-text-muted">
                  Keep going to unlock this achievement
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
