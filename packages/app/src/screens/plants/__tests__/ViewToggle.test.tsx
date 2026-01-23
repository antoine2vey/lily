import { fireEvent, render, screen } from '@testing-library/react-native'
import { ViewToggle } from '../components/ViewToggle'

describe('ViewToggle', () => {
  const mockOnToggle = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with grid view showing list icon', () => {
    render(<ViewToggle view="grid" onToggle={mockOnToggle} />)

    expect(screen.getByTestId('view-toggle')).toBeTruthy()
    expect(screen.getByTestId('icon-view-list')).toBeTruthy()
  })

  it('renders with list view showing grid icon', () => {
    render(<ViewToggle view="list" onToggle={mockOnToggle} />)

    expect(screen.getByTestId('icon-grid-view')).toBeTruthy()
  })

  it('calls onToggle when pressed', () => {
    render(<ViewToggle view="grid" onToggle={mockOnToggle} />)

    fireEvent.press(screen.getByTestId('view-toggle'))

    expect(mockOnToggle).toHaveBeenCalled()
  })

  it('has accessibility label for grid view', () => {
    render(<ViewToggle view="grid" onToggle={mockOnToggle} />)

    expect(screen.getByLabelText('Switch to list view')).toBeTruthy()
  })

  it('has accessibility label for list view', () => {
    render(<ViewToggle view="list" onToggle={mockOnToggle} />)

    expect(screen.getByLabelText('Switch to grid view')).toBeTruthy()
  })
})
