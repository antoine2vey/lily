import { fireEvent, render, screen } from '@testing-library/react-native'
import { CareSchedule } from '../CareSchedule'

describe('CareSchedule', () => {
  const mockOnEdit = jest.fn()

  const defaultProps = {
    wateringDays: 3,
    wateringDate: 'Next: Monday',
    fertilizingDays: 10 as number | null,
    fertilizingDate: 'Next: Jan 20',
    mistingDays: null as number | null,
    mistingDate: '',
    repottingDays: null as number | null,
    repottingDate: '',
    onEdit: mockOnEdit,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders care schedule section', () => {
    render(<CareSchedule {...defaultProps} />)

    expect(screen.getByTestId('care-schedule')).toBeTruthy()
  })

  it('displays section header', () => {
    render(<CareSchedule {...defaultProps} />)

    expect(screen.getByText('Care Schedule')).toBeTruthy()
  })

  it('displays watering card with days', () => {
    render(<CareSchedule {...defaultProps} />)

    expect(screen.getByTestId('care-card-watering')).toBeTruthy()
    expect(screen.getByText('In 3 days')).toBeTruthy()
    expect(screen.getByText('Watering')).toBeTruthy()
  })

  it('displays fertilizing card when within 14 days', () => {
    render(<CareSchedule {...defaultProps} />)

    expect(screen.getByTestId('care-card-fertilizing')).toBeTruthy()
    expect(screen.getByText('In 10 days')).toBeTruthy()
    expect(screen.getByText('Fertilizing')).toBeTruthy()
  })

  it('hides cards beyond 14 days', () => {
    render(
      <CareSchedule
        {...defaultProps}
        fertilizingDays={20}
        fertilizingDate="Next: Feb 10"
      />
    )

    expect(screen.queryByTestId('care-card-fertilizing')).toBeNull()
  })

  it('hides cards that are not scheduled', () => {
    render(<CareSchedule {...defaultProps} />)

    expect(screen.queryByTestId('care-card-misting')).toBeNull()
    expect(screen.queryByTestId('care-card-repotting')).toBeNull()
  })

  it('displays next dates', () => {
    render(<CareSchedule {...defaultProps} />)

    expect(screen.getByText('Next: Monday')).toBeTruthy()
    expect(screen.getByText('Next: Jan 20')).toBeTruthy()
  })

  it('shows overdue state when days are negative', () => {
    render(
      <CareSchedule
        {...defaultProps}
        wateringDays={-2}
        wateringDate="Was due Jan 4"
      />
    )

    expect(screen.getByText('2 days overdue')).toBeTruthy()
    expect(screen.getByText('Was due Jan 4')).toBeTruthy()
  })

  it('calls onEdit when edit button pressed', () => {
    render(<CareSchedule {...defaultProps} />)

    fireEvent.press(screen.getByText('Edit'))

    expect(mockOnEdit).toHaveBeenCalledTimes(1)
  })

  it('shows misting card when misting schedule is within 14 days', () => {
    render(
      <CareSchedule
        {...defaultProps}
        mistingDays={2}
        mistingDate="Next: Wednesday"
      />
    )

    expect(screen.getByTestId('care-card-misting')).toBeTruthy()
    expect(screen.getByText('Misting')).toBeTruthy()
  })

  it('shows repotting card when repotting schedule is within 14 days', () => {
    render(
      <CareSchedule
        {...defaultProps}
        repottingDays={7}
        repottingDate="Next: Feb 12"
      />
    )

    expect(screen.getByTestId('care-card-repotting')).toBeTruthy()
    expect(screen.getByText('Repotting')).toBeTruthy()
  })

  it('shows card at exactly 14 days boundary', () => {
    render(
      <CareSchedule
        {...defaultProps}
        fertilizingDays={14}
        fertilizingDate="Next: Jan 27"
      />
    )

    expect(screen.getByTestId('care-card-fertilizing')).toBeTruthy()
    expect(screen.getByText('In 14 days')).toBeTruthy()
  })
})
