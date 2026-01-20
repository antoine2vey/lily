import { fireEvent, render, screen } from '@testing-library/react-native'
import { ViewToggle } from '../ViewToggle'

describe('ViewToggle', () => {
  it('renders toggle button', () => {
    render(<ViewToggle view="grid" onToggle={jest.fn()} />)
    expect(screen.getByTestId('view-toggle')).toBeTruthy()
  })

  it('calls onToggle when pressed', () => {
    const onToggle = jest.fn()
    render(<ViewToggle view="grid" onToggle={onToggle} />)
    fireEvent.press(screen.getByTestId('view-toggle'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('has correct accessibility label for grid view', () => {
    render(<ViewToggle view="grid" onToggle={jest.fn()} />)
    expect(screen.getByLabelText('Switch to list view')).toBeTruthy()
  })

  it('has correct accessibility label for list view', () => {
    render(<ViewToggle view="list" onToggle={jest.fn()} />)
    expect(screen.getByLabelText('Switch to grid view')).toBeTruthy()
  })
})
