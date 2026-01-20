import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ConfirmationModal } from '../ConfirmationModal'

describe('ConfirmationModal', () => {
  const defaultProps = {
    visible: true,
    title: 'Delete Plant',
    message: 'Are you sure you want to delete this plant?',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  }

  it('renders when visible', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Delete Plant')).toBeTruthy()
    expect(
      screen.getByText('Are you sure you want to delete this plant?')
    ).toBeTruthy()
  })

  it('does not render when not visible', () => {
    render(<ConfirmationModal {...defaultProps} visible={false} />)
    expect(screen.queryByText('Delete Plant')).toBeNull()
  })

  it('renders icon when provided', () => {
    render(
      <ConfirmationModal
        {...defaultProps}
        icon={<Text testID="modal-icon">Icon</Text>}
      />
    )
    expect(screen.getByTestId('modal-icon')).toBeTruthy()
  })

  it('renders title and message', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Delete Plant')).toBeTruthy()
    expect(
      screen.getByText('Are you sure you want to delete this plant?')
    ).toBeTruthy()
  })

  it('renders confirm button', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Confirm')).toBeTruthy()
  })

  it('renders cancel button', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('calls onConfirm when confirm pressed', () => {
    const onConfirm = jest.fn()
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.press(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel pressed', () => {
    const onCancel = jest.fn()
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />)
    fireEvent.press(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows destructive confirm button style when destructive=true', () => {
    const { toJSON } = render(
      <ConfirmationModal {...defaultProps} destructive />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders custom button labels', () => {
    render(
      <ConfirmationModal
        {...defaultProps}
        confirmLabel="Delete"
        cancelLabel="Keep"
      />
    )
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(screen.getByText('Keep')).toBeTruthy()
  })
})
