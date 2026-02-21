import { MaterialIcons } from '@expo/vector-icons'
import type { AchievementRarity, AchievementWithProgress } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Modal, Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useIconColors } from 'src/hooks/useIconColors'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CONFETTI_COUNT = 80
const EXIT_DURATION = 300

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

// --- Confetti ---

const CONFETTI_COLORS = [
  '#FFD700',
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
]

interface ConfettiPiece {
  x: number
  delay: number
  color: string
  size: number
  rotation: number
  drift: number
  fallDuration: number
  spinExtra: number
}

const generateConfetti = (): ConfettiPiece[] =>
  Array.makeBy(CONFETTI_COUNT, (i) => ({
    x: Math.random() * SCREEN_WIDTH,
    delay: Math.random() * 800,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#FFD700',
    size: 5 + Math.random() * 7,
    rotation: Math.random() * 360,
    drift: (Math.random() - 0.5) * 150,
    fallDuration: 2200 + Math.random() * 2000,
    spinExtra: 720 + Math.random() * 720,
  }))

function ConfettiParticle({ piece }: { piece: ConfettiPiece }) {
  const translateY = useSharedValue(-20)
  const translateX = useSharedValue(0)
  const rotate = useSharedValue(piece.rotation)
  const opacity = useSharedValue(1)

  useEffect(() => {
    translateY.value = withDelay(
      piece.delay,
      withTiming(SCREEN_HEIGHT + 40, {
        duration: piece.fallDuration,
        easing: Easing.out(Easing.quad),
      })
    )
    translateX.value = withDelay(
      piece.delay,
      withTiming(piece.drift, {
        duration: piece.fallDuration,
        easing: Easing.inOut(Easing.sin),
      })
    )
    rotate.value = withDelay(
      piece.delay,
      withTiming(piece.rotation + piece.spinExtra, { duration: 3000 })
    )
    opacity.value = withDelay(
      2000 + piece.delay,
      withTiming(0, { duration: 800 })
    )
  }, [
    translateY,
    translateX,
    rotate,
    opacity,
    piece.delay,
    piece.fallDuration,
    piece.drift,
    piece.rotation,
    piece.spinExtra,
  ])

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: piece.x,
    top: -20,
    width: piece.size,
    height: piece.size * 1.4,
    borderRadius: 2,
    backgroundColor: piece.color,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${String(rotate.value)}deg` },
    ],
    opacity: opacity.value,
  }))

  return <Animated.View style={style} />
}

// --- Pulsing glow ring ---

function GlowRing({ color }: { color: string }) {
  const scale = useSharedValue(0.8)
  const opacity = useSharedValue(0)

  useEffect(() => {
    scale.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1.15, {
            duration: 1200,
            easing: Easing.out(Easing.ease),
          }),
          withTiming(0.95, {
            duration: 1200,
            easing: Easing.in(Easing.ease),
          })
        ),
        -1,
        true
      )
    )
    opacity.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1200 }),
          withTiming(0.1, { duration: 1200 })
        ),
        -1,
        true
      )
    )
  }, [scale, opacity])

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: color,
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  return <Animated.View style={style} />
}

// --- Icon bounce ---

function BouncingIcon({
  iconName,
  color,
}: {
  iconName: keyof typeof MaterialIcons.glyphMap
  color: string
}) {
  const scale = useSharedValue(0)

  useEffect(() => {
    scale.value = withDelay(300, withSpring(1, { damping: 6, stiffness: 120 }))
  }, [scale])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Animated.View
      className="w-28 h-28 rounded-full items-center justify-center"
      style={[{ backgroundColor: `${color}20` }, style]}
    >
      <MaterialIcons name={iconName} size={56} color={color} />
    </Animated.View>
  )
}

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
  const confetti = useMemo(generateConfetti, [])

  const rarityColor = getRarityColor(achievement.rarity, iconColors)
  const iconName = getIconName(achievement.icon)

  // Entrance / exit shared values
  const cardTranslateY = useSharedValue(300)
  const cardScale = useSharedValue(0.85)
  const backdropOpacity = useSharedValue(0)

  // Entrance
  useEffect(() => {
    backdropOpacity.value = withTiming(1, { duration: 300 })
    cardTranslateY.value = withSpring(0, { damping: 14, stiffness: 100 })
    cardScale.value = withSpring(1, { damping: 14, stiffness: 100 })
  }, [backdropOpacity, cardTranslateY, cardScale])

  // Exit: animate out, then call onDismiss to actually hide the Modal
  const handleClose = useCallback(() => {
    backdropOpacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: Easing.in(Easing.ease),
    })
    cardTranslateY.value = withTiming(200, {
      duration: EXIT_DURATION,
      easing: Easing.in(Easing.ease),
    })
    cardScale.value = withTiming(
      0.85,
      {
        duration: EXIT_DURATION,
        easing: Easing.in(Easing.ease),
      },
      (finished) => {
        if (finished) {
          runOnJS(onDismiss)()
        }
      }
    )
  }, [onDismiss, backdropOpacity, cardTranslateY, cardScale])

  const backdropStyle = useAnimatedStyle(() => ({
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    opacity: backdropOpacity.value,
  }))

  const cardStyle = useAnimatedStyle(() => ({
    width: '85%' as unknown as number,
    transform: [
      { translateY: cardTranslateY.value },
      { scale: cardScale.value },
    ],
  }))

  return (
    <>
      {/* Backdrop + Card */}
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

              {/* Icon with glow */}
              <View className="items-center mt-5">
                <View className="items-center justify-center mb-4">
                  <GlowRing color={rarityColor} />
                  <BouncingIcon iconName={iconName} color={rarityColor} />
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

      {/* Confetti layer (above backdrop + card) */}
      <View
        style={{
          position: 'absolute',
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
        }}
        pointerEvents="none"
      >
        {Array.map(confetti, (piece, i) => (
          <ConfettiParticle key={String(i)} piece={piece} />
        ))}
      </View>
    </>
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
