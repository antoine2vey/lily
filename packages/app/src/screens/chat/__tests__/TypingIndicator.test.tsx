import { render } from '@testing-library/react-native'
import { TypingIndicator } from '../components/TypingIndicator'

describe('TypingIndicator', () => {
  it('renders typing indicator', () => {
    const { toJSON } = render(<TypingIndicator />)
    expect(toJSON()).toBeTruthy()
  })
})
