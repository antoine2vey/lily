import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TAB_BAR_HEIGHT = 80

export function TabBarSpacer() {
  const { bottom } = useSafeAreaInsets()
  return (
    <View
      className="bg-transparent"
      style={{ height: bottom + TAB_BAR_HEIGHT }}
    />
  )
}
