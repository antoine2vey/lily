import { LiquidGlassView } from '@callstack/liquid-glass'
import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe, String } from 'effect'
import * as Haptics from 'expo-haptics'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, TextInput, View } from 'react-native'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedImage } from '@/components/AnimatedImage'
import { PhotoSourceSheet } from '@/components/PhotoSourceSheet'
import { useIconColors } from '@/hooks/useIconColors'
import { useKeyboardShown } from '@/hooks/useKeyboardShown'
import { PressableScale } from '@/screens/chat/components/PressableScale'
import { iconColorsLight } from '@/theme'
import { useGlass } from '@/utils/glass'

const SEND_ACTIVE_BG = iconColorsLight.primary
const SEND_IDLE_BG_DARK = 'rgba(255,255,255,0.1)'
const SEND_TIMING = { duration: 200, easing: Easing.out(Easing.cubic) }

interface SendButtonProps {
  canSend: boolean
  onPress: () => void
}

function SendButton({ canSend, onPress }: SendButtonProps) {
  const { t } = useTranslation('chat')
  const iconColors = useIconColors()
  const idleBg = iconColors.isDark ? SEND_IDLE_BG_DARK : iconColors.border
  const progress = useSharedValue(canSend ? 1 : 0)
  const pop = useSharedValue(1)

  useEffect(() => {
    progress.value = withTiming(canSend ? 1 : 0, SEND_TIMING)
    if (canSend) {
      pop.value = withSequence(
        withTiming(1.08, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 170, easing: Easing.inOut(Easing.quad) })
      )
    }
  }, [canSend, progress, pop])

  const surfaceStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [idleBg, SEND_ACTIVE_BG]
    ),
    transform: [{ scale: pop.value }],
  }))
  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))
  const idleIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }))

  return (
    <PressableScale
      onPress={onPress}
      disabled={!canSend}
      accessibilityRole="button"
      accessibilityLabel={t('input.send')}
      accessibilityState={{ disabled: !canSend }}
      testID="chat-send-button"
      surfaceClassName="w-9 h-9"
    >
      <Animated.View
        className="flex-1 rounded-full items-center justify-center"
        style={surfaceStyle}
      >
        <Animated.View className="absolute" style={activeIconStyle}>
          <MaterialIcons
            name="arrow-upward"
            size={20}
            color={iconColors.white}
          />
        </Animated.View>
        <Animated.View style={idleIconStyle}>
          <MaterialIcons
            name="arrow-upward"
            size={20}
            color={iconColors.textMuted}
          />
        </Animated.View>
      </Animated.View>
    </PressableScale>
  )
}

function ComposerSurface({ children }: { children: ReactNode }) {
  if (useGlass) {
    return (
      <LiquidGlassView interactive={false} style={{ borderRadius: 28 }}>
        {children}
      </LiquidGlassView>
    )
  }
  return (
    <View className="bg-surface dark:bg-surface-dark rounded-[28px] border border-border/60 dark:border-white/10 shadow-soft dark:shadow-none">
      {children}
    </View>
  )
}

interface ChatInputProps {
  onSend: (message: string, imageUri?: string) => void
  disabled?: boolean
  isPlantChat: boolean
}

export function ChatInput({ onSend, disabled, isPlantChat }: ChatInputProps) {
  const { t } = useTranslation('chat')
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const keyboardShown = useKeyboardShown()
  const [message, setMessage] = useState('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false)

  const trimmedMessage = String.trim(message)
  const canSend =
    (!String.isEmpty(trimmedMessage) || attachedImage !== null) && !disabled

  const handleSend = () => {
    if (!canSend) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onSend(
      trimmedMessage,
      Option.getOrUndefined(Option.fromNullishOr(attachedImage))
    )
    setMessage('')
    setAttachedImage(null)
  }

  return (
    <View
      pointerEvents="box-none"
      className="px-3 pt-1"
      style={{ paddingBottom: keyboardShown ? 8 : Math.max(insets.bottom, 12) }}
    >
      <ComposerSurface>
        {pipe(
          Option.fromNullishOr(attachedImage),
          Option.match({
            onNone: () => null,
            onSome: (uri) => (
              <View className="p-1.5 pb-0 flex-row">
                <View>
                  <AnimatedImage
                    source={{ uri }}
                    className="w-16 h-16 rounded-lg"
                  />
                  <Pressable
                    onPress={() => setAttachedImage(null)}
                    accessibilityRole="button"
                    accessibilityLabel={t('input.removeImage')}
                    hitSlop={8}
                    className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] rounded-full items-center justify-center bg-black/60"
                  >
                    <MaterialIcons
                      name="close"
                      size={14}
                      color={iconColors.white}
                    />
                  </Pressable>
                </View>
              </View>
            ),
          })
        )}

        <View className="flex-row items-end p-1.5">
          <PressableScale
            onPress={() => setPhotoSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('input.attach')}
            testID="chat-attach-button"
            surfaceClassName={`w-9 h-9 rounded-full items-center justify-center ${
              useGlass ? '' : 'bg-surface-tinted dark:bg-white/10'
            }`}
          >
            <MaterialIcons
              name="add"
              size={22}
              color={iconColors.textPrimary}
            />
          </PressableScale>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t(
              isPlantChat ? 'input.placeholderPlant' : 'input.placeholder'
            )}
            placeholderTextColor={iconColors.textMuted}
            multiline
            className="flex-1 px-3 py-2 max-h-32 font-regular text-base text-text-primary dark:text-white"
            editable={!disabled}
          />
          <SendButton canSend={canSend} onPress={handleSend} />
        </View>
      </ComposerSurface>

      <PhotoSourceSheet
        visible={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        onPhoto={setAttachedImage}
        aspect={[4, 3]}
      />
    </View>
  )
}
