import { render, screen } from '@testing-library/react-native'
import { Option } from 'effect'
import { MockToastProvider } from 'src/__tests__/mocks/providers'
import { Toast } from '../Toast'

// Mock the ToastContext
const mockToastState = {
  visible: true,
  message: 'Test message',
  action: Option.none(),
  id: 'toast-1',
}

jest.mock('src/contexts/ToastContext', () => ({
  useToast: () => ({
    state: mockToastState,
    showToast: jest.fn(),
    hideToast: jest.fn(),
  }),
}))

describe('Toast', () => {
  beforeEach(() => {
    mockToastState.visible = true
    mockToastState.message = 'Test message'
    mockToastState.action = Option.none()
  })

  it('renders message when visible', () => {
    render(<Toast />)
    expect(screen.getByText('Test message')).toBeTruthy()
  })

  it('returns null when not visible and no message', () => {
    mockToastState.visible = false
    mockToastState.message = ''
    const { toJSON } = render(<Toast />)
    expect(toJSON()).toBeNull()
  })

  it('renders with action button', () => {
    mockToastState.action = Option.some({
      label: 'Undo',
      onPress: jest.fn(),
    })
    render(<Toast />)
    expect(screen.getByText('Undo')).toBeTruthy()
  })

  it('renders without action button when none', () => {
    mockToastState.action = Option.none()
    render(<Toast />)
    expect(screen.queryByText('Undo')).toBeNull()
  })

  it('renders with long message', () => {
    mockToastState.message =
      'This is a very long toast message that should still display correctly'
    render(<Toast />)
    expect(
      screen.getByText(
        'This is a very long toast message that should still display correctly'
      )
    ).toBeTruthy()
  })

  it('renders correctly with animation styles', () => {
    const { toJSON } = render(<Toast />)
    expect(toJSON()).toBeTruthy()
  })
})
