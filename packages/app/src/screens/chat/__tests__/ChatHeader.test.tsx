import { render } from '@testing-library/react-native'
import { ChatHeader } from '../components/ChatHeader'

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}))

describe('ChatHeader', () => {
  it('renders chat header', () => {
    const { toJSON } = render(<ChatHeader />)
    expect(toJSON()).toBeTruthy()
  })
})
