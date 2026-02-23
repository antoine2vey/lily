import { Text } from 'react-native'

function Markdown({ children }: { children: string; style?: unknown }) {
  return <Text>{children}</Text>
}

export default Markdown
