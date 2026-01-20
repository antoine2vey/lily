import { fireEvent, render } from '@testing-library/react-native'
import { HydrationCard } from '../HydrationCard'

describe('HydrationCard', () => {
  const mockPlants = [
    { id: '1', name: 'Monstera', imageUrl: 'https://example.com/1.jpg' },
    { id: '2', name: 'Fern', imageUrl: 'https://example.com/2.jpg' },
    { id: '3', name: 'Snake Plant' },
  ]

  const defaultProps = {
    plants: mockPlants,
    onWaterAll: jest.fn(),
    onPlantPress: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders title "Hydration Time"', () => {
    const { getByText } = render(<HydrationCard {...defaultProps} />)
    expect(getByText('Hydration Time')).toBeTruthy()
  })

  it('renders plant count in subtitle', () => {
    const { getByText } = render(<HydrationCard {...defaultProps} />)
    expect(getByText('3 plants need water today')).toBeTruthy()
  })

  it('renders singular when 1 plant', () => {
    const { getByText } = render(
      <HydrationCard {...defaultProps} plants={[mockPlants[0]]} />
    )
    expect(getByText('1 plant needs water today')).toBeTruthy()
  })

  it('renders up to 3 plant thumbnails', () => {
    const { getAllByLabelText } = render(<HydrationCard {...defaultProps} />)
    const thumbnails = getAllByLabelText(/View/)
    expect(thumbnails.length).toBe(3)
  })

  it('shows "+X" indicator when more than 3 plants', () => {
    const manyPlants = [
      ...mockPlants,
      { id: '4', name: 'Pothos' },
      { id: '5', name: 'Philodendron' },
    ]
    const { getByText } = render(
      <HydrationCard {...defaultProps} plants={manyPlants} />
    )
    expect(getByText('+2')).toBeTruthy()
  })

  it('calls onWaterAll when button pressed', () => {
    const onWaterAll = jest.fn()
    const { getByText } = render(
      <HydrationCard {...defaultProps} onWaterAll={onWaterAll} />
    )
    fireEvent.press(getByText('Water All'))
    expect(onWaterAll).toHaveBeenCalledTimes(1)
  })

  it('calls onPlantPress when plant thumbnail pressed', () => {
    const onPlantPress = jest.fn()
    const { getByLabelText } = render(
      <HydrationCard {...defaultProps} onPlantPress={onPlantPress} />
    )
    fireEvent.press(getByLabelText('View Monstera'))
    expect(onPlantPress).toHaveBeenCalledWith('1')
  })

  it('returns null when no plants need water', () => {
    const { toJSON } = render(<HydrationCard {...defaultProps} plants={[]} />)
    expect(toJSON()).toBeNull()
  })
})
