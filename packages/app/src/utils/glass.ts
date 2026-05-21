import { isLiquidGlassSupported } from '@callstack/liquid-glass'
import { Platform } from 'react-native'

export const useGlass = isLiquidGlassSupported && Platform.OS === 'ios'
