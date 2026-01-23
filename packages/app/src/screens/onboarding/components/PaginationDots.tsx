import { Array, pipe } from 'effect'
import { View } from 'react-native'

interface PaginationDotsProps {
  total: number
  current: number
  testID?: string
}

export function PaginationDots({
  total,
  current,
  testID,
}: PaginationDotsProps) {
  return (
    <View testID={testID} className="flex-row items-center justify-center">
      {pipe(
        Array.range(0, total - 1),
        Array.map((index) => {
          const isActive = index === current
          return (
            <View
              key={index}
              className={`mx-1 rounded-full h-2 ${isActive ? 'w-6 bg-primary' : 'w-2 bg-border'}`}
            />
          )
        })
      )}
    </View>
  )
}
