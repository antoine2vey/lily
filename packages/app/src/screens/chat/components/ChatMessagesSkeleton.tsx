import { Array } from 'effect'
import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

interface BubbleLine {
  id: string
  // Fixed px widths (not %) so each bubble shrink-wraps to its widest line
  // like a real text bubble, instead of collapsing to its padding.
  width: number
}

interface MessageRow {
  id: string
  role: 'assistant' | 'user'
  lines: ReadonlyArray<BubbleLine>
}

// Alternating assistant/user placeholder messages mirroring ChatMessage.tsx:
// assistant rows are left-aligned with a leading avatar and a
// bg-primary-tint / dark:bg-primary/20 bubble; user rows are right-aligned
// with a trailing avatar and a bg-surface bubble bordered like the real one.
// Line widths vary to simulate the natural variable length of chat text.
const ROWS: ReadonlyArray<MessageRow> = [
  {
    id: 'assistant-1',
    role: 'assistant',
    lines: [
      { id: 'assistant-1-l1', width: 220 },
      { id: 'assistant-1-l2', width: 190 },
      { id: 'assistant-1-l3', width: 130 },
    ],
  },
  {
    id: 'user-1',
    role: 'user',
    lines: [
      { id: 'user-1-l1', width: 150 },
      { id: 'user-1-l2', width: 100 },
    ],
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    lines: [
      { id: 'assistant-2-l1', width: 200 },
      { id: 'assistant-2-l2', width: 150 },
    ],
  },
]

export function ChatMessagesSkeleton() {
  return (
    <View className="flex-1 p-4">
      {Array.map(ROWS, (row) => {
        const isUser = row.role === 'user'
        return (
          <View key={row.id} className="mb-4">
            <View
              className={`flex-row items-start ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {!isUser && (
                <View className="mr-3 mt-3">
                  <SkeletonCircle size={32} />
                </View>
              )}
              <View
                className={`flex-1 ${isUser ? 'items-end' : 'items-start'}`}
              >
                <View
                  className={`px-4 py-3 rounded-md ${
                    isUser
                      ? 'bg-surface dark:bg-surface-dark border border-border dark:border-slate-700'
                      : 'bg-primary-tint dark:bg-primary/20'
                  }`}
                  style={{
                    borderBottomLeftRadius: isUser ? 16 : 4,
                    borderBottomRightRadius: isUser ? 4 : 16,
                  }}
                >
                  {Array.map(row.lines, (line, lineIndex) => (
                    <View
                      key={line.id}
                      className={lineIndex === 0 ? '' : 'mt-2'}
                    >
                      <SkeletonBox
                        width={line.width}
                        height={18}
                        rounded="sm"
                      />
                    </View>
                  ))}
                </View>
              </View>
              {isUser && (
                <View className="ml-3 mt-3">
                  <SkeletonCircle size={32} />
                </View>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}
