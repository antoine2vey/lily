import { fireEvent, render, screen } from '@testing-library/react-native'
import { QuickActions } from '../QuickActions'

describe('QuickActions', () => {
  const mockOnWater = jest.fn()
  const mockOnFertilize = jest.fn()
  const mockOnPhoto = jest.fn()
  const mockOnChat = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders quick actions container', () => {
    render(
      <QuickActions
        onWater={mockOnWater}
        onFertilize={mockOnFertilize}
        onPhoto={mockOnPhoto}
        onChat={mockOnChat}
      />
    )

    expect(screen.getByTestId('quick-actions')).toBeTruthy()
  })

  it('renders all action buttons', () => {
    render(
      <QuickActions
        onWater={mockOnWater}
        onFertilize={mockOnFertilize}
        onPhoto={mockOnPhoto}
        onChat={mockOnChat}
      />
    )

    expect(screen.getByText('Water')).toBeTruthy()
    expect(screen.getByText('Fertilize')).toBeTruthy()
    expect(screen.getByText('Photo')).toBeTruthy()
    expect(screen.getByText('Chat')).toBeTruthy()
  })

  it('calls onWater when water button is pressed', () => {
    render(
      <QuickActions
        onWater={mockOnWater}
        onFertilize={mockOnFertilize}
        onPhoto={mockOnPhoto}
        onChat={mockOnChat}
      />
    )

    fireEvent.press(screen.getByTestId('quick-action-water'))

    expect(mockOnWater).toHaveBeenCalledTimes(1)
  })

  it('calls onFertilize when fertilize button is pressed', () => {
    render(
      <QuickActions
        onWater={mockOnWater}
        onFertilize={mockOnFertilize}
        onPhoto={mockOnPhoto}
        onChat={mockOnChat}
      />
    )

    fireEvent.press(screen.getByTestId('quick-action-fertilize'))

    expect(mockOnFertilize).toHaveBeenCalledTimes(1)
  })

  it('calls onPhoto when photo button is pressed', () => {
    render(
      <QuickActions
        onWater={mockOnWater}
        onFertilize={mockOnFertilize}
        onPhoto={mockOnPhoto}
        onChat={mockOnChat}
      />
    )

    fireEvent.press(screen.getByTestId('quick-action-photo'))

    expect(mockOnPhoto).toHaveBeenCalledTimes(1)
  })

  it('calls onChat when chat button is pressed', () => {
    render(
      <QuickActions
        onWater={mockOnWater}
        onFertilize={mockOnFertilize}
        onPhoto={mockOnPhoto}
        onChat={mockOnChat}
      />
    )

    fireEvent.press(screen.getByTestId('quick-action-chat'))

    expect(mockOnChat).toHaveBeenCalledTimes(1)
  })
})
