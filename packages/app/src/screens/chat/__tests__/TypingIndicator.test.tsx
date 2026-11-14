import { render } from '@testing-library/react-native'
import { TypingIndicator } from '../components/TypingIndicator'

describe('TypingIndicator', () => {
  it('renders the dots while the reply is pending', () => {
    const { toJSON } = render(<TypingIndicator visible />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders nothing once the reply has content', () => {
    const { toJSON } = render(<TypingIndicator visible={false} />)
    expect(toJSON()).toBeNull()
  })
})
