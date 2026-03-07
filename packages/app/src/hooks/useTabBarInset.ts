import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Bubble height (72) + bottom margin (8) from LiquidGlassTabBar */
const TAB_BAR_HEIGHT = 80

/**
 * Returns the bottom padding needed to clear the floating tab bar.
 * Use this in `contentContainerStyle={{ paddingBottom }}` for any
 * scrollable screen rendered under the tab bar overlay.
 */
export function useTabBarInset() {
  const { bottom } = useSafeAreaInsets()
  return bottom + TAB_BAR_HEIGHT
}
