import type { AchievementRarity, AchievementWithProgress } from '@lily/shared'
import { Match, pipe } from 'effect'
import type { TFunction } from 'i18next'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { Mascot } from '@/components/Mascot'
import { useIconColors } from '@/hooks/useIconColors'

const ENTER_DURATION = 250
const EXIT_DURATION = 200
const OFFSET = 16

type IconColors = ReturnType<typeof useIconColors>

const getRarityColor = (
  rarity: AchievementRarity,
  iconColors: IconColors
): string =>
  pipe(
    Match.value(rarity),
    Match.when('common', () => '#9CA3AF'),
    Match.when('rare', () => iconColors.info),
    Match.when('epic', () => '#8B5CF6'),
    Match.when('legendary', () => iconColors.achievementGold),
    Match.exhaustive
  )

const getRarityLabel = (rarity: AchievementRarity, t: TFunction): string =>
  t(`rarity.${rarity}`)

// --- Staggered fade-in wrapper ---

function StaggerIn({
  delay,
  children,
}: {
  delay: number
  children: React.ReactNode
}) {
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(12)

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }))
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) })
    )
  }, [opacity, translateY, delay])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return <Animated.View style={style}>{children}</Animated.View>
}

// --- Modal content ---

function AchievementModalContent({
  achievement,
  onDismiss,
}: {
  achievement: AchievementWithProgress
  onDismiss: () => void
}) {
  const { t } = useTranslation('achievements')
  const iconColors = useIconColors()

  const rarityColor = getRarityColor(achievement.rarity, iconColors)

  // 0 = hidden, 1 = shown. The card sits OFFSET px lower while hidden, so
  // it rises as it fades in and drops as it fades out.
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: ENTER_DURATION,
      easing: Easing.out(Easing.cubic),
    })
  }, [progress])

  const handleClose = useCallback(() => {
    progress.value = withTiming(
      0,
      { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(onDismiss)()
        }
      }
    )
  }, [onDismiss, progress])

  const backdropStyle = useAnimatedStyle(() => ({
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    opacity: progress.value,
  }))

  const cardStyle = useAnimatedStyle(() => ({
    width: '85%' as unknown as number,
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * OFFSET }],
  }))

  return (
    <Animated.View style={backdropStyle}>
      <Pressable
        style={{
          flex: 1,
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPress={handleClose}
      >
        <Animated.View style={cardStyle}>
          <Pressable
            className="rounded-3xl p-6 bg-surface overflow-hidden"
            onPress={() => {}}
          >
            {/* Colored top accent bar */}
            <View
              className="absolute top-0 left-0 right-0 h-1.5"
              style={{ backgroundColor: rarityColor }}
            />

            {/* Title */}
            <StaggerIn delay={300}>
              <Text
                className="text-lg text-center font-semibold text-text-primary mt-4"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('unlockModal.title')}
              </Text>
            </StaggerIn>

            <View className="items-center mt-5">
              <View className="mb-3">
                <Mascot animation="celebrate" size={160} />
              </View>

              {/* Rarity badge */}
              <StaggerIn delay={500}>
                <View
                  className="px-3 py-1 rounded-full mb-3"
                  style={{ backgroundColor: `${rarityColor}20` }}
                >
                  <Text
                    className="text-xs uppercase font-semibold"
                    style={{
                      color: rarityColor,
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                    }}
                  >
                    {getRarityLabel(achievement.rarity, t)}
                  </Text>
                </View>
              </StaggerIn>

              {/* Achievement name */}
              <StaggerIn delay={600}>
                <Text
                  className="text-xl text-center font-bold text-text-primary"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
                >
                  {achievement.name}
                </Text>
              </StaggerIn>

              {/* Description */}
              <StaggerIn delay={750}>
                <Text
                  className="text-base text-center mt-2 font-regular text-text-secondary"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  {achievement.description}
                </Text>
              </StaggerIn>
            </View>

            {/* Continue button */}
            <StaggerIn delay={900}>
              <Pressable
                className="bg-primary active:bg-primary-dark rounded-xl py-4 px-8 mt-6"
                onPress={handleClose}
              >
                <Text
                  className="text-white text-base text-center"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                >
                  {t('unlockModal.continue')}
                </Text>
              </Pressable>
            </StaggerIn>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

// --- Main export ---

interface AchievementUnlockedModalProps {
  visible: boolean
  achievement: AchievementWithProgress | null
  onClose: () => void
}

export function AchievementUnlockedModal({
  visible,
  achievement,
  onClose,
}: AchievementUnlockedModalProps) {
  // Keep the Modal mounted during exit animation
  const [modalVisible, setModalVisible] = useState(false)
  const [displayedAchievement, setDisplayedAchievement] =
    useState<AchievementWithProgress | null>(null)

  useEffect(() => {
    if (visible && achievement) {
      setDisplayedAchievement(achievement)
      setModalVisible(true)
    }
    // When visible goes false, we do NOT hide the modal here.
    // The content's exit animation calls handleDismiss instead.
  }, [visible, achievement])

  const handleDismiss = useCallback(() => {
    setModalVisible(false)
    setDisplayedAchievement(null)
    onClose()
  }, [onClose])

  if (!displayedAchievement) return null

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      {modalVisible && (
        <AchievementModalContent
          achievement={displayedAchievement}
          onDismiss={handleDismiss}
        />
      )}
    </Modal>
  )
}
