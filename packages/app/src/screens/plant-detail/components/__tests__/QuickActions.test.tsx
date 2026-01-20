import { fireEvent, render, screen } from '@testing-library/react-native'
import { QuickActions } from '../QuickActions'

describe('QuickActions', () => {
  const defaultProps = {
    onWater: jest.fn(),
    onFertilize: jest.fn(),
    onPhoto: jest.fn(),
    onChat: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders all 4 action buttons', () => {
    render(<QuickActions {...defaultProps} />)
    expect(screen.getByTestId('quick-action-water')).toBeTruthy()
    expect(screen.getByTestId('quick-action-fertilize')).toBeTruthy()
    expect(screen.getByTestId('quick-action-photo')).toBeTruthy()
    expect(screen.getByTestId('quick-action-chat')).toBeTruthy()
  })

  it('renders labels for all actions', () => {
    render(<QuickActions {...defaultProps} />)
    expect(screen.getByText('Water')).toBeTruthy()
    expect(screen.getByText('Fertilize')).toBeTruthy()
    expect(screen.getByText('Photo')).toBeTruthy()
    expect(screen.getByText('Chat')).toBeTruthy()
  })

  it('calls onWater when water pressed', () => {
    render(<QuickActions {...defaultProps} />)
    fireEvent.press(screen.getByTestId('quick-action-water'))
    expect(defaultProps.onWater).toHaveBeenCalledTimes(1)
  })

  it('calls onFertilize when fertilize pressed', () => {
    render(<QuickActions {...defaultProps} />)
    fireEvent.press(screen.getByTestId('quick-action-fertilize'))
    expect(defaultProps.onFertilize).toHaveBeenCalledTimes(1)
  })

  it('calls onPhoto when photo pressed', () => {
    render(<QuickActions {...defaultProps} />)
    fireEvent.press(screen.getByTestId('quick-action-photo'))
    expect(defaultProps.onPhoto).toHaveBeenCalledTimes(1)
  })

  it('calls onChat when chat pressed', () => {
    render(<QuickActions {...defaultProps} />)
    fireEvent.press(screen.getByTestId('quick-action-chat'))
    expect(defaultProps.onChat).toHaveBeenCalledTimes(1)
  })
})
