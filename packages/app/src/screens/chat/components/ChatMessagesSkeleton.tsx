import { Array } from 'effect'
import { View } from 'react-native'
import { SkeletonBox } from '@/components/skeletons'
import { USER_BUBBLE_CLASSES } from '@/screens/chat/components/ChatMessage'

interface BubbleLine {
  id: string
  width: number
}

interface MessageRow {
  id: string
  role: 'assistant' | 'user'
  lines: ReadonlyArray<BubbleLine>
}

const ROWS: ReadonlyArray<MessageRow> = [
  {
    id: 'assistant-1',
    role: 'assistant',
    lines: [
      { id: 'assistant-1-l1', width: 300 },
      { id: 'assistant-1-l2', width: 270 },
      { id: 'assistant-1-l3', width: 160 },
    ],
  },
  {
    id: 'user-1',
    role: 'user',
    lines: [
      { id: 'user-1-l1', width: 170 },
      { id: 'user-1-l2', width: 110 },
    ],
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    lines: [
      { id: 'assistant-2-l1', width: 290 },
      { id: 'assistant-2-l2', width: 200 },
    ],
  },
]

const SkeletonLines = ({ lines }: { lines: ReadonlyArray<BubbleLine> }) =>
  Array.map(lines, (line, lineIndex) => (
    <View key={line.id} className={lineIndex === 0 ? '' : 'mt-2'}>
      <SkeletonBox width={line.width} height={16} rounded="sm" />
    </View>
  ))

export function ChatMessagesSkeleton() {
  return (
    <View className="flex-1 px-4 pt-5">
      {Array.map(ROWS, (row) =>
        row.role === 'user' ? (
          <View key={row.id} className="mb-6 items-end">
            <View className={`${USER_BUBBLE_CLASSES} py-3`}>
              <SkeletonLines lines={row.lines} />
            </View>
          </View>
        ) : (
          <View key={row.id} className="mb-6">
            <SkeletonLines lines={row.lines} />
          </View>
        )
      )}
    </View>
  )
}
