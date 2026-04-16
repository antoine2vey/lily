import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface ScannerOverlayProps {
  statusText: string
  helperText: string
  children?: ReactNode
}

export function ScannerOverlay({
  statusText,
  helperText,
  children,
}: ScannerOverlayProps) {
  const iconColors = useIconColors()

  return (
    <View className="flex-1" pointerEvents="none">
      {/* Top dark area */}
      <View className="flex-1 bg-black/60" />

      {/* Middle row containing the frame */}
      <View className="flex-row items-center">
        {/* Left dark area */}
        <View className="flex-1 bg-black/60 self-stretch" />

        {/* Scanner frame (clear center - no background) */}
        <View className="w-[85%] aspect-[4/3] relative">
          {/* Corner markers */}
          <View className="absolute -top-0.5 -left-0.5 w-10 h-10 border-t-4 border-l-4 border-primary" />
          <View className="absolute -top-0.5 -right-0.5 w-10 h-10 border-t-4 border-r-4 border-primary" />
          <View className="absolute -bottom-0.5 -left-0.5 w-10 h-10 border-b-4 border-l-4 border-primary" />
          <View className="absolute -bottom-0.5 -right-0.5 w-10 h-10 border-b-4 border-r-4 border-primary" />

          {/* Inner grid line */}
          <View className="absolute inset-4 border border-white/10 rounded-lg" />

          {/* Optional children inside frame */}
          {children}
        </View>

        {/* Right dark area */}
        <View className="flex-1 bg-black/60 self-stretch" />
      </View>

      {/* Bottom dark area with status */}
      <View className="flex-1 bg-black/60 items-center pt-8">
        {/* Status chip */}
        <View
          className="flex-row items-center gap-2 h-10 rounded-full px-4 border border-white/10"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <MaterialIcons
            name="center-focus-strong"
            size={20}
            color={iconColors.primary}
          />
          <Text className="text-primary text-sm font-medium">{statusText}</Text>
        </View>
        {/* Helper text */}
        <Text className="text-white/80 text-base font-regular mt-4 text-center px-4">
          {helperText}
        </Text>
      </View>
    </View>
  )
}
