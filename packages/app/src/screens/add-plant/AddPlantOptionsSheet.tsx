import { MaterialIcons } from '@expo/vector-icons'
import { BottomSheet } from 'src/components/BottomSheet'
import { ListRow } from 'src/components/ListRow'
import { iconColors } from 'src/theme'

interface AddPlantOptionsSheetProps {
  visible: boolean
  onClose: () => void
  onSelectAI: () => void
  onSelectScan: () => void
  onSelectManual: () => void
}

export function AddPlantOptionsSheet({
  visible,
  onClose,
  onSelectAI,
  onSelectScan,
  onSelectManual,
}: AddPlantOptionsSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Plant">
      <ListRow
        leftIcon={
          <MaterialIcons
            name="camera-alt"
            size={20}
            color={iconColors.primary}
          />
        }
        title="Identify with AI"
        subtitle="Snap a photo for instant info"
        showChevron
        onPress={() => {
          onClose()
          onSelectAI()
        }}
      />
      <ListRow
        leftIcon={
          <MaterialIcons
            name="qr-code-scanner"
            size={20}
            color={iconColors.primary}
          />
        }
        title="Scan nursery card"
        subtitle="Read the tag from the store"
        showChevron
        onPress={() => {
          onClose()
          onSelectScan()
        }}
      />
      <ListRow
        leftIcon={
          <MaterialIcons name="edit" size={20} color={iconColors.primary} />
        }
        title="Add manually"
        subtitle="Type in the name yourself"
        showChevron
        onPress={() => {
          onClose()
          onSelectManual()
        }}
      />
    </BottomSheet>
  )
}
