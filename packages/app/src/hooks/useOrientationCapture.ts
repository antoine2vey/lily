import { headingToOrientation, type Orientation } from '@lily/shared'
import * as Device from 'expo-device'
import * as Location from 'expo-location'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

export type OrientationCaptureStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unavailable'

export interface OrientationCapture {
  rotation: SharedValue<number>
  orientation: Orientation | null
  status: OrientationCaptureStatus
  /** Request permission (may prompt) then start the live heading stream. */
  start: () => void
  /** Start only if permission is already granted — never prompts. */
  startIfPermitted: () => void
  stop: () => void
}

/** No reading within this window after start → treat as emulator/unavailable. */
const FIRST_READING_TIMEOUT_MS = 3000

/**
 * Live compass capture for a room's window orientation.
 *
 * Maintains a Reanimated shared value (`rotation`) that accumulates the
 * shortest-path angular delta so the needle never spins the long way across the
 * 0°/360° seam. The needle is driven entirely on the UI thread from that shared
 * value; React state (`orientation`, `status`) is updated only when the snapped
 * compass bucket or the capture state changes, NOT on every heading reading.
 *
 * `startIfPermitted` lets a host render a live compass on mount without ever
 * prompting (the app already holds foreground location for weather), while
 * `start` is the explicit "enable" action that may prompt.
 */
export function useOrientationCapture(): OrientationCapture {
  const rotation = useSharedValue(0)
  const prev = useSharedValue(0)

  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const [status, setStatus] = useState<OrientationCaptureStatus>('idle')

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null)
  const firstReadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  // Last snapped direction — gates `setOrientation` so it fires once per bucket.
  const lastDirectionRef = useRef<Orientation | null>(null)
  // True continuous accumulated heading (the rotation TARGET). Kept separate
  // from `rotation` (the animated, possibly-mid-flight value) so we never build
  // the next target on a lagging base — that would progressively under-rotate.
  const targetRef = useRef(0)

  const teardown = useCallback(() => {
    if (subscriptionRef.current != null) {
      subscriptionRef.current.remove()
      subscriptionRef.current = null
    }
    if (firstReadingTimerRef.current != null) {
      clearTimeout(firstReadingTimerRef.current)
      firstReadingTimerRef.current = null
    }
    lastDirectionRef.current = null
  }, [])

  const stop = useCallback(() => {
    teardown()
    setStatus('idle')
  }, [teardown])

  const handleReading = useCallback(
    (obj: Location.LocationHeadingObject) => {
      const h = obj.trueHeading >= 0 ? obj.trueHeading : obj.magHeading
      if (h < 0) return

      // First valid reading arrived: we're a real device with a compass.
      if (firstReadingTimerRef.current != null) {
        clearTimeout(firstReadingTimerRef.current)
        firstReadingTimerRef.current = null
      }
      setStatus('active')

      // Accumulate the true heading via the shortest-path delta (which also
      // smooths the 0°/360° seam), then animate toward that target.
      const delta = ((h - prev.value + 540) % 360) - 180
      prev.value = h
      targetRef.current += delta
      rotation.value = withTiming(targetRef.current, { duration: 120 })

      // Re-render only when the snapped bucket actually changes — readings
      // arrive several times/sec and the needle is already animated on the UI
      // thread, so per-reading setState would be wasted re-renders.
      const snapped = headingToOrientation(h)
      if (lastDirectionRef.current !== snapped) {
        lastDirectionRef.current = snapped
        setOrientation(snapped)
      }
    },
    [prev, rotation]
  )

  // Subscribe to the heading stream. Caller has already ensured permission.
  const beginWatch = useCallback(async () => {
    setStatus('requesting')
    try {
      // If no reading lands in time, assume no usable compass → fall back.
      firstReadingTimerRef.current = setTimeout(() => {
        teardown()
        setStatus('unavailable')
      }, FIRST_READING_TIMEOUT_MS)

      subscriptionRef.current = await Location.watchHeadingAsync(handleReading)
    } catch {
      teardown()
      setStatus('unavailable')
    }
  }, [handleReading, teardown])

  const start = useCallback(async () => {
    teardown()
    prev.value = 0
    targetRef.current = 0
    rotation.value = 0

    if (!Device.isDevice) {
      setStatus('unavailable')
      return
    }

    setStatus('requesting')
    try {
      const { status: permission } =
        await Location.requestForegroundPermissionsAsync()
      if (permission !== Location.PermissionStatus.GRANTED) {
        setStatus('denied')
        return
      }
      await beginWatch()
    } catch {
      teardown()
      setStatus('unavailable')
    }
  }, [beginWatch, teardown, prev, rotation])

  const startIfPermitted = useCallback(async () => {
    teardown()
    prev.value = 0
    targetRef.current = 0
    rotation.value = 0

    if (!Device.isDevice) {
      setStatus('unavailable')
      return
    }

    try {
      const { status: permission } =
        await Location.getForegroundPermissionsAsync()
      if (permission === Location.PermissionStatus.GRANTED) {
        await beginWatch()
      } else {
        // Don't prompt on mount — leave it to the explicit enable action.
        setStatus('idle')
      }
    } catch {
      setStatus('idle')
    }
  }, [beginWatch, teardown, prev, rotation])

  useEffect(() => teardown, [teardown])

  return {
    rotation,
    orientation,
    status,
    start,
    startIfPermitted,
    stop,
  }
}
