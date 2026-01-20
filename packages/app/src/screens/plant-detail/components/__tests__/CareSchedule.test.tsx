import { fireEvent, render, screen } from '@testing-library/react-native'
import { CareSchedule } from '../CareSchedule'

describe('CareSchedule', () => {
  const defaultProps = {
    wateringDays: 3,
    wateringDate: 'Next: Tuesday',
    fertilizingDays: 14,
    fertilizingDate: 'Next: Feb 15',
    onEdit: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders section header with Edit action', () => {
    render(<CareSchedule {...defaultProps} />)
    expect(screen.getByText('Care Schedule')).toBeTruthy()
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('renders watering card with days', () => {
    render(<CareSchedule {...defaultProps} />)
    expect(screen.getByTestId('care-card-watering')).toBeTruthy()
    expect(screen.getByText('Watering')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders fertilizing card with days', () => {
    render(<CareSchedule {...defaultProps} />)
    expect(screen.getByTestId('care-card-fertilizing')).toBeTruthy()
    expect(screen.getByText('Fertilizing')).toBeTruthy()
    expect(screen.getByText('14')).toBeTruthy()
  })

  it('shows overdue styling when days < 0', () => {
    render(<CareSchedule {...defaultProps} wateringDays={-2} />)
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('OVERDUE')).toBeTruthy()
  })

  it('shows DAYS label when not overdue', () => {
    render(<CareSchedule {...defaultProps} />)
    expect(screen.getAllByText('DAYS').length).toBeGreaterThan(0)
  })

  it('calls onEdit when Edit pressed', () => {
    render(<CareSchedule {...defaultProps} />)
    fireEvent.press(screen.getByText('Edit'))
    expect(defaultProps.onEdit).toHaveBeenCalledTimes(1)
  })

  it('displays next date for watering', () => {
    render(<CareSchedule {...defaultProps} />)
    expect(screen.getByText('Next: Tuesday')).toBeTruthy()
  })

  it('displays next date for fertilizing', () => {
    render(<CareSchedule {...defaultProps} />)
    expect(screen.getByText('Next: Feb 15')).toBeTruthy()
  })
})
