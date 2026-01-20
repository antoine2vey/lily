import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { Pressable } from 'react-native'

type ViewMode = 'grid' | 'list'

interface ViewToggleProps {
  view: ViewMode
  onToggle: () => void
}

const getIconName = (view: ViewMode): 'view-list' | 'grid-view' =>
  pipe(
    Match.value(view),
    Match.when('grid', () => 'view-list' as const),
    Match.when('list', () => 'grid-view' as const),
    Match.exhaustive
  )

export function ViewToggle({ view, onToggle }: ViewToggleProps) {
  const iconName = getIconName(view)

  return (
    <Pressable
      onPress={onToggle}
      className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-soft"
      testID="view-toggle"
      accessibilityLabel={`Switch to ${view === 'grid' ? 'list' : 'grid'} view`}
    >
      <MaterialIcons
        name={iconName}
        size={24}
        color="#141712"
        testID={`icon-${iconName}`}
      />
    </Pressable>
  )
}

export type { ViewMode }
