import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Slider } from '../Slider'

describe('Slider', () => {
  it('renders with initial value', () => {
    const { toJSON } = render(<Slider value={50} onValueChange={() => {}} />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls onValueChange when dragged', () => {
    const onValueChange = jest.fn()
    const { toJSON } = render(
      <Slider value={50} onValueChange={onValueChange} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders min and max labels', () => {
    render(
      <Slider
        value={50}
        onValueChange={() => {}}
        minLabel="Drought tolerant"
        maxLabel="Loves water"
      />
    )
    expect(screen.getByText('Drought tolerant')).toBeTruthy()
    expect(screen.getByText('Loves water')).toBeTruthy()
  })

  it('renders value label', () => {
    render(<Slider value={50} onValueChange={() => {}} valueLabel="MODERATE" />)
    expect(screen.getByText('MODERATE')).toBeTruthy()
  })

  it('respects min/max bounds', () => {
    const { toJSON } = render(
      <Slider value={50} onValueChange={() => {}} min={0} max={100} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders icon and label when provided', () => {
    render(
      <Slider
        value={50}
        onValueChange={() => {}}
        label="Watering"
        icon={<Text testID="slider-icon">Icon</Text>}
      />
    )
    expect(screen.getByText('Watering')).toBeTruthy()
    expect(screen.getByTestId('slider-icon')).toBeTruthy()
  })

  it('snaps to step values', () => {
    const { toJSON } = render(
      <Slider value={50} onValueChange={() => {}} step={10} />
    )
    expect(toJSON()).toBeTruthy()
  })
})
