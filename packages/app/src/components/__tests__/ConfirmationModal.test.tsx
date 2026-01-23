import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ConfirmationModal } from '../ConfirmationModal'

describe('ConfirmationModal', () => {
  const defaultProps = {
    visible: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders title', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Confirm Action')).toBeTruthy()
  })

  it('renders message', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Are you sure you want to proceed?')).toBeTruthy()
  })

  it('renders default confirm label', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Confirm')).toBeTruthy()
  })

  it('renders default cancel label', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('renders custom confirm label', () => {
    render(<ConfirmationModal {...defaultProps} confirmLabel="Delete" />)
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  it('renders custom cancel label', () => {
    render(<ConfirmationModal {...defaultProps} cancelLabel="Go Back" />)
    expect(screen.getByText('Go Back')).toBeTruthy()
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

  it('renders with destructive variant', () => {
    const { toJSON } = render(
      <ConfirmationModal {...defaultProps} destructive />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders icon when provided', () => {
    const icon = <Text testID="modal-icon">Icon</Text>
    render(<ConfirmationModal {...defaultProps} icon={icon} />)
    expect(screen.getByTestId('modal-icon')).toBeTruthy()
  })

  it('does not render content when not visible', () => {
    const { queryByText } = render(
      <ConfirmationModal {...defaultProps} visible={false} />
    )
    // Content should not be rendered when modal is not visible
    expect(queryByText('Confirm Action')).toBeNull()
  })

  it('renders with all props', () => {
    const { toJSON } = render(
      <ConfirmationModal
        {...defaultProps}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        destructive
        icon={<Text>Icon</Text>}
      />
    )
    expect(toJSON()).toBeTruthy()
  })
})
