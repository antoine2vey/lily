import { CARE_TASK_UNDO_TIMEOUT_MS } from '@lily/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Pressable, Text, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { fonts } from '@/theme'

const BORDER_WIDTH = 2
const BORDER_RADIUS = 8

const AnimatedRect = Animated.createAnimatedComponent(Rect)

interface UndoButtonProps {
  onUndo: () => void
}

export function UndoButton({ onUndo }: UndoButtonProps) {
  const { t } = useTranslation('care')
  const progress = useRef(new Animated.Value(1)).current
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Calculate perimeter for stroke-dasharray
  // For rounded rect: 2*(w+h) - 8*r + 2*π*r
  const perimeter =
    dimensions.width > 0 && dimensions.height > 0
      ? 2 * (dimensions.width + dimensions.height) -
        8 * BORDER_RADIUS +
        2 * Math.PI * BORDER_RADIUS
      : 0

  useEffect(() => {
    if (perimeter > 0) {
      Animated.timing(progress, {
        toValue: perimeter,
        duration: CARE_TASK_UNDO_TIMEOUT_MS,
        useNativeDriver: false,
      }).start()
    }

    return () => {
      progress.stopAnimation()
    }
  }, [progress, perimeter])

  return (
    <Pressable
      onPress={onUndo}
      hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
    >
      <View
        className="relative"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          setDimensions({ width, height })
        }}
      >
        {/* Content */}
        <View
          className="px-3 py-2 bg-surface dark:bg-surface-dark"
          style={{ borderRadius: BORDER_RADIUS }}
        >
          <Text
            className="text-sm text-primary"
            style={{ fontFamily: fonts.semiBold }}
          >
            {t('task.undoPrompt')}
          </Text>
        </View>

        {/* SVG border overlay */}
        {dimensions.width > 0 && dimensions.height > 0 && (
          <Svg
            width={dimensions.width}
            height={dimensions.height}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            pointerEvents="none"
          >
            <AnimatedRect
              x={BORDER_WIDTH / 2}
              y={BORDER_WIDTH / 2}
              width={dimensions.width - BORDER_WIDTH - 0.5}
              height={dimensions.height - BORDER_WIDTH - 0.5}
              rx={BORDER_RADIUS}
              ry={BORDER_RADIUS}
              fill="none"
              stroke="#80ac53"
              strokeWidth={BORDER_WIDTH}
              strokeDasharray={perimeter}
              strokeDashoffset={progress}
            />
          </Svg>
        )}
      </View>
    </Pressable>
  )
}
