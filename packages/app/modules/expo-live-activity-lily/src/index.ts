import { requireNativeModule } from 'expo'
import { Platform } from 'react-native'

// Subset of Activity<CareTasksAttributes> bridged from Swift. Kept minimal —
// the server drives content; the app only needs to register tokens and end
// activities locally.
export interface ActiveActivity {
  activityId: string
  pushToken: string | null
}

interface EventSubscription {
  remove(): void
}

// Events emitted from the Swift side (Events("onPushToStartToken", ...)).
// Names must match the Swift `Events(...)` declaration exactly.
type NativeEvents = {
  onPushToStartToken: { token: string }
  onActivityToken: { activityId: string; pushToken: string }
}

// Expo modules expose a generic `addListener(eventName, cb)` — not
// per-event helper methods. The native module also has the direct
// AsyncFunction/Function methods declared in Swift.
interface RawNativeModule {
  isPushToStartSupported(): boolean
  requestPushToStartToken(): Promise<string | null>
  listActiveActivities(): Promise<ActiveActivity[]>
  endActivity(activityId: string): Promise<void>
  addListener<E extends keyof NativeEvents>(
    event: E,
    cb: (payload: NativeEvents[E]) => void
  ): EventSubscription
}

// No-op shim for non-iOS — keeps the JS API safe to call from platform-
// agnostic code.
const noopModule: RawNativeModule = {
  isPushToStartSupported: () => false,
  requestPushToStartToken: async () => null,
  listActiveActivities: async () => [],
  endActivity: async () => {},
  addListener: () => ({ remove: () => {} }),
}

const getModule = (): RawNativeModule => {
  if (Platform.OS !== 'ios') return noopModule
  try {
    return requireNativeModule<RawNativeModule>('ExpoLiveActivityLilyModule')
  } catch {
    // Native module not linked (e.g. Expo Go, tests) — fall back to shim.
    return noopModule
  }
}

const native = getModule()

export const isPushToStartSupported = (): boolean =>
  native.isPushToStartSupported()

export const requestPushToStartToken = (): Promise<string | null> =>
  native.requestPushToStartToken()

export const subscribeToPushToStartTokenUpdates = (
  cb: (token: string) => void
): (() => void) => {
  const sub = native.addListener('onPushToStartToken', (p) => cb(p.token))
  return () => sub.remove()
}

export const subscribeToActivityTokens = (
  cb: (payload: { activityId: string; pushToken: string }) => void
): (() => void) => {
  const sub = native.addListener('onActivityToken', (p) =>
    cb({ activityId: p.activityId, pushToken: p.pushToken })
  )
  return () => sub.remove()
}

export const listActiveActivities = (): Promise<ActiveActivity[]> =>
  native.listActiveActivities()

export const endActivity = (activityId: string): Promise<void> =>
  native.endActivity(activityId)
