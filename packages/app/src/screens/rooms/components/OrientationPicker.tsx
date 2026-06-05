import { ORIENTATION_INFO, type Orientation } from '@lily/shared'
import { Match, Option, pipe } from 'effect'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { toast } from 'sonner-native'
import { useOrientationCapture } from '@/hooks/useOrientationCapture'
import { CompassDial } from '@/screens/rooms/components/CompassDial'

interface OrientationPickerProps {
  value: Orientation | null
  onChange: (value: Orientation | null) => void
}

export function OrientationPicker({ value, onChange }: OrientationPickerProps) {
  const { t } = useTranslation('rooms')
  const capture = useOrientationCapture()
  const { startIfPermitted, stop, rotation } = capture
  // True when the current locked value came from a live capture (so the rose is
  // already at the real heading and must NOT be reset to the bucket center).
  const lockedFromLiveRef = useRef(false)

  // Locked vs live. When a direction is set, stop the live compass and freeze
  // the dial. A live lock keeps the real heading; editing a saved room (no live
  // heading) falls back to the direction's bearing. When cleared, resume live.
  useEffect(() => {
    if (value === null) {
      lockedFromLiveRef.current = false
      startIfPermitted()
    } else {
      stop()
      if (!lockedFromLiveRef.current) {
        rotation.value = ORIENTATION_INFO[value].degrees
      }
    }
  }, [value, startIfPermitted, stop, rotation])

  const handleUseDetected = () => {
    Option.match(Option.fromNullable(capture.orientation), {
      onNone: () => {},
      onSome: (o) => {
        // Freeze on the real heading (already in `rotation`), not the bucket.
        lockedFromLiveRef.current = true
        onChange(o)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        toast.success(t('orientationDetected'))
      },
    })
  }

  // Live detection controls (only shown while no direction is locked).
  const liveControls = pipe(
    Match.value(capture.status),
    Match.when('active', () => (
      <View className="gap-1.5">
        <Text className="text-xs text-text-muted dark:text-slate-400">
          {Option.match(Option.fromNullable(capture.orientation), {
            onNone: () => t('orientationCalibrate'),
            onSome: (o) =>
              `${ORIENTATION_INFO[o].icon}  ${t(`orientationLevels.${o}`)}`,
          })}
        </Text>
        <Pressable
          onPress={handleUseDetected}
          className="px-4 py-2 rounded-xl self-start bg-primary"
        >
          <Text className="text-xs font-semibold text-white">
            {t('orientationUseDirection')}
          </Text>
        </Pressable>
      </View>
    )),
    Match.when('requesting', () => (
      <Text className="text-xs text-text-muted dark:text-slate-400">
        {t('orientationCalibrate')}
      </Text>
    )),
    Match.when('unavailable', () => (
      <Text className="text-xs text-text-muted dark:text-slate-400">
        {t('orientationUnavailable')}
      </Text>
    )),
    // 'idle' or 'denied' → offer the explicit (prompting) enable action.
    Match.orElse(() => (
      <View className="gap-1.5">
        {capture.status === 'denied' && (
          <Text className="text-xs text-text-muted dark:text-slate-400">
            {t('orientationPermissionDenied')}
          </Text>
        )}
        <Pressable
          onPress={() => capture.start()}
          className="px-4 py-2 rounded-xl bg-surface dark:bg-slate-600 self-start"
        >
          <Text className="text-xs font-medium text-primary">
            {t('detectOrientation')}
          </Text>
        </Pressable>
      </View>
    ))
  )

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-text-primary dark:text-white pl-1">
        {t('orientation')}
      </Text>
      <Text className="text-xs text-text-muted dark:text-slate-400 pl-1">
        {t('orientationHint')}
      </Text>

      <View className="flex-row items-center gap-3 p-3 rounded-xl bg-surface-tinted dark:bg-slate-700">
        <CompassDial
          rotation={rotation}
          orientation={value !== null ? value : capture.orientation}
          size={110}
        />
        <View className="flex-1 gap-2">
          {value !== null ? (
            <View className="flex-row items-center gap-2">
              <Text className="text-xl">{ORIENTATION_INFO[value].icon}</Text>
              <Text className="flex-1 text-base font-semibold text-text-primary dark:text-white">
                {t(`orientationLevels.${value}`)}
              </Text>
              <Pressable
                onPress={() => onChange(null)}
                className="px-3 py-1.5 rounded-lg bg-surface dark:bg-slate-600"
              >
                <Text className="text-xs font-medium text-primary">
                  {t('orientationClear')}
                </Text>
              </Pressable>
            </View>
          ) : (
            liveControls
          )}
        </View>
      </View>
    </View>
  )
}
