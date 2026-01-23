import { fireEvent, render, screen } from '@testing-library/react-native'
import { UndoButton } from '../components/UndoButton'

describe('UndoButton', () => {
  const mockOnUndo = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders undo text', () => {
    render(<UndoButton onUndo={mockOnUndo} />)

    expect(screen.getByText('Undo ?')).toBeTruthy()
  })

  it('calls onUndo when pressed', () => {
    render(<UndoButton onUndo={mockOnUndo} />)

    fireEvent.press(screen.getByText('Undo ?'))

    expect(mockOnUndo).toHaveBeenCalled()
  })

  it('calls onUndo only once per press', () => {
    render(<UndoButton onUndo={mockOnUndo} />)

    fireEvent.press(screen.getByText('Undo ?'))
    fireEvent.press(screen.getByText('Undo ?'))

    expect(mockOnUndo).toHaveBeenCalledTimes(2)
  })
})
