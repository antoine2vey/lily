import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocalization } from '@/hooks/useLocalization'

interface AddPlantOptionsSheetProps {
  visible: boolean
  onClose: () => void
  onSelectAI: () => void
  onSelectScan: () => void
  onSelectManual: () => void
}

interface OptionCardProps {
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  subtitle: string
  onPress: () => void
}

function OptionCard({ icon, title, subtitle, onPress }: OptionCardProps) {
  const iconColors = useIconColors()

  return (
    <Pressable
      onPress={onPress}
      className="bg-slate-100 dark:bg-slate-800 rounded-[24px] p-4 active:scale-[0.98]"
    >
      <View className="flex-row items-center gap-5">
        {/* Icon Container */}
        <View
          className="w-16 h-16 rounded-full bg-white dark:bg-surface-dark items-center justify-center"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
          }}
        >
          <MaterialIcons name={icon} size={28} color={iconColors.primaryDark} />
        </View>
        {/* Text Content */}
        <View className="flex-1">
          <Text className="text-lg font-bold text-text-primary dark:text-white mb-1">
            {title}
          </Text>
          <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {subtitle}
          </Text>
        </View>
        {/* Chevron */}
        <MaterialIcons
          name="chevron-right"
          size={24}
          color={iconColors.slate400}
        />
      </View>
    </Pressable>
  )
}

export function AddPlantOptionsSheet({
  visible,
  onClose,
  onSelectAI,
  onSelectScan,
  onSelectManual,
}: AddPlantOptionsSheetProps) {
  const { t } = useLocalization()

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('addPlant:title')}
    >
      <View className="gap-4">
        <OptionCard
          icon="camera-enhance"
          title={t('addPlant:options.identifyAi.title')}
          subtitle={t('addPlant:options.identifyAi.description')}
          onPress={() => {
            onClose()
            onSelectAI()
          }}
        />
        <OptionCard
          icon="local-offer"
          title={t('addPlant:options.scanCard.title')}
          subtitle={t('addPlant:options.scanCard.description')}
          onPress={() => {
            onClose()
            onSelectScan()
          }}
        />
        <OptionCard
          icon="edit"
          title={t('addPlant:options.manual.title')}
          subtitle={t('addPlant:options.manual.description')}
          onPress={() => {
            onClose()
            onSelectManual()
          }}
        />
      </View>
    </BottomSheet>
  )
}
