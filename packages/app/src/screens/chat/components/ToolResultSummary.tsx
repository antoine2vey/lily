import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { useIconColors } from '@/hooks/useIconColors'

interface ToolResultSummaryProps {
  testID: string
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  subtitle?: string | undefined
  /** Small status pill on the right of the summary (e.g. "Added", "HIGH"). */
  badge?: ReactNode
  buttonLabel: string
  sheetTitle: string
  /** Full content, rendered inside the bottom sheet. */
  children: ReactNode
  /**
   * Opens the sheet without a tap, for a result that just arrived. Stays
   * true across remounts (history refetch replaces streamed messages) until
   * the user closes the sheet, which calls `onAutoOpenHandled`.
   */
  autoOpen?: boolean | undefined
  onAutoOpenHandled?: (() => void) | undefined
}

/**
 * Compact chat row for a tool result (diagnosis, care plan) with a button
 * that opens the full card in a bottom sheet. Keeps the transcript short
 * while the details stay one tap away.
 */
export function ToolResultSummary({
  testID,
  icon,
  title,
  subtitle,
  badge,
  buttonLabel,
  sheetTitle,
  children,
  autoOpen = false,
  onAutoOpenHandled,
}: ToolResultSummaryProps) {
  const iconColors = useIconColors()
  const [open, setOpen] = useState(autoOpen)

  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  const handleClose = () => {
    setOpen(false)
    if (autoOpen) onAutoOpenHandled?.()
  }

  return (
    <>
      <View
        testID={testID}
        className="bg-surface dark:bg-surface-dark rounded-lg p-3 border border-border dark:border-slate-700 my-2"
      >
        <View className="flex-row items-center">
          <View className="w-9 h-9 rounded-full bg-primary-tint dark:bg-primary/20 items-center justify-center mr-3">
            <MaterialIcons name={icon} size={20} color={iconColors.primary} />
          </View>
          <View className="flex-1">
            <Text
              className="text-base font-semibold text-text-primary dark:text-white"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                className="text-xs text-text-muted dark:text-slate-400 mt-0.5"
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>
          {badge}
        </View>
        <Pressable
          testID={`${testID}-open`}
          onPress={() => setOpen(true)}
          className="flex-row items-center justify-center py-2 rounded-md bg-primary-tint dark:bg-primary/20 mt-3"
        >
          <MaterialIcons
            name="open-in-full"
            size={16}
            color={iconColors.primary}
          />
          <Text
            className="text-sm font-semibold text-primary ml-1.5"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      </View>

      <BottomSheet
        visible={open}
        onClose={handleClose}
        title={sheetTitle}
        snapPoints={['85%']}
      >
        <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </BottomSheet>
    </>
  )
}
