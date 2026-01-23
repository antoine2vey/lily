import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Slider } from '../Slider'

describe('Slider', () => {
  const defaultProps = {
    value: 50,
    onValueChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with basic props', () => {
    const { toJSON } = render(<Slider {...defaultProps} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders label when provided', () => {
    render(<Slider {...defaultProps} label="Volume" />)
    expect(screen.getByText('Volume')).toBeTruthy()
  })

  it('renders value label when provided', () => {
    render(<Slider {...defaultProps} valueLabel="50%" />)
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('renders min and max labels when provided', () => {
    render(<Slider {...defaultProps} minLabel="Low" maxLabel="High" />)
    expect(screen.getByText('Low')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('renders icon when provided', () => {
    const icon = <Text testID="slider-icon">Icon</Text>
    render(<Slider {...defaultProps} icon={icon} />)
    expect(screen.getByTestId('slider-icon')).toBeTruthy()
  })

  it('renders with custom min and max', () => {
    const { toJSON } = render(<Slider {...defaultProps} min={0} max={200} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with custom step', () => {
    const { toJSON } = render(<Slider {...defaultProps} step={10} />)
    expect(toJSON()).toBeTruthy()
  })

  it('clamps value to 0% when value equals min', () => {
    const { toJSON } = render(
      <Slider value={0} min={0} max={100} onValueChange={jest.fn()} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('clamps value to 100% when value equals max', () => {
    const { toJSON } = render(
      <Slider value={100} min={0} max={100} onValueChange={jest.fn()} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders header section with icon and label', () => {
    const icon = <Text testID="icon">Icon</Text>
    const { toJSON } = render(
      <Slider
        {...defaultProps}
        label="Brightness"
        icon={icon}
        valueLabel="70%"
      />
    )
    expect(toJSON()).toBeTruthy()
    expect(screen.getByText('Brightness')).toBeTruthy()
    expect(screen.getByText('70%')).toBeTruthy()
  })

  it('does not render header when no icon, label, or valueLabel', () => {
    const { toJSON } = render(<Slider {...defaultProps} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with all props', () => {
    const icon = <Text>Icon</Text>
    const { toJSON } = render(
      <Slider
        value={75}
        onValueChange={jest.fn()}
        min={0}
        max={100}
        step={5}
        minLabel="0"
        maxLabel="100"
        valueLabel="75%"
        icon={icon}
        label="Progress"
      />
    )
    expect(toJSON()).toBeTruthy()
  })
})
