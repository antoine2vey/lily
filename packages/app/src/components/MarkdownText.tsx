import { Array, Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Text, type TextStyle, View } from 'react-native'

interface MarkdownTextProps {
  children: string
  textClassName?: string
  className?: string
}

interface TextSegment {
  text: string
  bold: boolean
  italic: boolean
}

// Parse inline markdown (bold and italic)
const parseInlineMarkdown = (text: string): TextSegment[] => {
  const segments: TextSegment[] = []

  // Regex for **bold** and *italic*
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
  while ((match = pattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        bold: false,
        italic: false,
      })
    }

    // Check if bold (**text**) or italic (*text*)
    if (match[2]) {
      // Bold
      segments.push({ text: match[2], bold: true, italic: false })
    } else if (match[3]) {
      // Italic
      segments.push({ text: match[3], bold: false, italic: true })
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      bold: false,
      italic: false,
    })
  }

  return segments.length > 0 ? segments : [{ text, bold: false, italic: false }]
}

// Get font style based on segment formatting
const getSegmentStyle = (segment: TextSegment): TextStyle | undefined =>
  pipe(
    Match.value(segment),
    Match.when({ bold: true }, () => ({ fontFamily: 'SpaceGrotesk_700Bold' })),
    Match.when({ italic: true }, () => ({ fontStyle: 'italic' as const })),
    Match.orElse(() => undefined)
  )

// Render a line with inline formatting
const renderLine = (
  line: string,
  lineIndex: number,
  textClassName?: string
): ReactNode => {
  const segments = parseInlineMarkdown(line)

  return (
    <Text key={lineIndex} className={textClassName}>
      {Array.map(segments, (segment, i) => {
        const segmentKey = `${lineIndex}-seg-${segment.text.slice(0, 10)}-${i}`
        return (
          <Text
            key={segmentKey}
            className={textClassName}
            style={getSegmentStyle(segment)}
          >
            {segment.text}
          </Text>
        )
      })}
    </Text>
  )
}

// Check if line is a list item
const isListItem = (
  line: string
): { isItem: boolean; marker: string; content: string } => {
  // Check for numbered list (1. 2. etc)
  const numberedMatch = line.match(/^(\d+\.)\s+(.*)/)
  if (numberedMatch) {
    return { isItem: true, marker: numberedMatch[1], content: numberedMatch[2] }
  }

  // Check for bullet list (- or *)
  const bulletMatch = line.match(/^([-*])\s+(.*)/)
  if (bulletMatch) {
    return { isItem: true, marker: '•', content: bulletMatch[2] }
  }

  return { isItem: false, marker: '', content: line }
}

export function MarkdownText({
  children,
  textClassName,
  className,
}: MarkdownTextProps) {
  // Normalize escaped newlines to actual newlines, then split
  const normalizedText = children.replace(/\\n/g, '\n')
  const lines = normalizedText.split(/\n/)

  return (
    <View className={className}>
      {Array.map(lines, (line, index) => {
        const trimmedLine = line.trim()
        // Create stable key from content hash and index for static markdown
        const lineKey = `line-${index}-${trimmedLine.slice(0, 20)}`

        // Skip completely empty lines but add spacing
        if (trimmedLine === '') {
          // biome-ignore lint/suspicious/noArrayIndexKey: markdown lines maintain stable order
          return <View key={`empty-${index}`} className="h-2" />
        }

        const { isItem, marker, content } = isListItem(trimmedLine)

        if (isItem) {
          return (
            <View key={lineKey} className="flex-row mb-1">
              <Text className={`${textClassName ?? ''} w-6`}>{marker}</Text>
              <View className="flex-1">
                {renderLine(content, index, textClassName)}
              </View>
            </View>
          )
        }

        return (
          <View key={lineKey} className="mb-1">
            {renderLine(trimmedLine, index, textClassName)}
          </View>
        )
      })}
    </View>
  )
}
