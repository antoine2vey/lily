import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheet as RawBottomSheet } from '@/components/ui/templates/bottom-sheet'
import type { BottomSheetMethods } from '@/components/ui/templates/bottom-sheet/types'
import { useIconColors } from '@/hooks/useIconColors'

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  snapPoints?: (string | number)[]
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoints = ['50%'],
}: BottomSheetProps) {
  const sheetRef = useRef<BottomSheetMethods>(null)
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        sheetRef.current?.snapToIndex(0)
      })
    }
  }, [visible])

  const handleClose = useCallback(() => {
    sheetRef.current?.close()
  }, [])

  if (!visible) return null

  return (
    <Modal transparent visible={visible} onRequestClose={handleClose}>
      <RawBottomSheet
        ref={sheetRef}
        snapPoints={snapPoints as `${number}%`[]}
        onClose={onClose}
        backgroundColor={iconColors.isDark ? '#252A1F' : '#FFFFFF'}
        borderRadius={32}
        handleStyle={
          iconColors.isDark ? { backgroundColor: '#475569' } : undefined
        }
      >
        {title && (
          <View className="px-6 py-4 flex-row items-center justify-between">
            <Text className="text-2xl text-text-primary dark:text-white font-bold tracking-tight">
              {title}
            </Text>
            <Pressable
              onPress={handleClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center"
            >
              <MaterialIcons
                name="close"
                size={20}
                color={iconColors.textSecondary}
              />
            </Pressable>
          </View>
        )}
        <View className="flex-1 px-5" style={{ paddingBottom: insets.bottom }}>
          {children}
        </View>
      </RawBottomSheet>
    </Modal>
  )
}
