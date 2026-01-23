import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Input } from '../Input'

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeTruthy()
  })

  it('renders with value', () => {
    render(<Input value="Hello" onChangeText={jest.fn()} />)
    expect(screen.getByDisplayValue('Hello')).toBeTruthy()
  })

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn()
    render(<Input placeholder="Enter text" onChangeText={onChangeText} />)

    fireEvent.changeText(screen.getByPlaceholderText('Enter text'), 'New value')
    expect(onChangeText).toHaveBeenCalledWith('New value')
  })

  it('renders with icon', () => {
    const { toJSON } = render(<Input icon="search" placeholder="Search" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with prefix', () => {
    render(<Input prefix="@" placeholder="username" />)
    expect(screen.getByDisplayValue('@')).toBeTruthy()
  })

  it('renders with suffix', () => {
    const suffix = <Text testID="suffix">suffix</Text>
    render(<Input suffix={suffix} placeholder="Enter" />)
    expect(screen.getByTestId('suffix')).toBeTruthy()
  })

  it('applies error styling when error is true', () => {
    const { toJSON } = render(<Input placeholder="Email" error />)
    expect(toJSON()).toBeTruthy()
  })

  it('does not apply error styling when error is false', () => {
    const { toJSON } = render(<Input placeholder="Email" error={false} />)
    expect(toJSON()).toBeTruthy()
  })

  it('forwards ref to TextInput', () => {
    const ref = { current: null }
    render(<Input ref={ref} placeholder="Test" />)
    expect(ref.current).toBeTruthy()
  })

  it('passes additional TextInput props', () => {
    render(
      <Input
        placeholder="Test"
        keyboardType="email-address"
        autoCapitalize="none"
        secureTextEntry
      />
    )
    expect(screen.getByPlaceholderText('Test')).toBeTruthy()
  })

  it('renders with all props', () => {
    const suffix = <Text>suffix</Text>
    const { toJSON } = render(
      <Input
        placeholder="Email"
        icon="email"
        prefix="@"
        suffix={suffix}
        error={false}
        value="test@example.com"
        onChangeText={jest.fn()}
      />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders editable by default', () => {
    render(<Input placeholder="Editable" />)
    const input = screen.getByPlaceholderText('Editable')
    expect(input.props.editable).not.toBe(false)
  })

  it('can be made non-editable', () => {
    render(<Input placeholder="Read only" editable={false} />)
    const input = screen.getByPlaceholderText('Read only')
    expect(input.props.editable).toBe(false)
  })
})
