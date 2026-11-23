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
      <View className="flex-1 bg-black/60" />

      <View className="flex-row items-center">
        <View className="flex-1 bg-black/60 self-stretch" />

        <View className="w-[85%] aspect-[4/3] relative">
          <View className="absolute -top-0.5 -left-0.5 w-10 h-10 border-t-4 border-l-4 border-primary" />
          <View className="absolute -top-0.5 -right-0.5 w-10 h-10 border-t-4 border-r-4 border-primary" />
          <View className="absolute -bottom-0.5 -left-0.5 w-10 h-10 border-b-4 border-l-4 border-primary" />
          <View className="absolute -bottom-0.5 -right-0.5 w-10 h-10 border-b-4 border-r-4 border-primary" />

          <View className="absolute inset-4 border border-white/10 rounded-lg" />

          {children}
        </View>

        <View className="flex-1 bg-black/60 self-stretch" />
      </View>

      <View className="flex-1 bg-black/60 items-center pt-8">
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
        <Text className="text-white/80 text-base font-regular mt-4 text-center px-4">
          {helperText}
        </Text>
      </View>
    </View>
  )
}
