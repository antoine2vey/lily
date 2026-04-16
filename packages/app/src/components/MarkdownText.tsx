import Markdown from '@ronradtke/react-native-markdown-display'
import { String as EffectString, pipe } from 'effect'
import { View } from 'react-native'
import { useMarkdownStyles } from '@/hooks/useMarkdownStyles'

interface MarkdownTextProps {
  children: string
  className?: string | undefined
}

export function MarkdownText({ children, className = '' }: MarkdownTextProps) {
  const styles = useMarkdownStyles()
  const text = pipe(children, EffectString.replaceAll('\\n', '\n'))

  return (
    <View className={className}>
      <Markdown style={styles}>{text}</Markdown>
    </View>
  )
}
