import { fireEvent, render, screen } from '@testing-library/react-native'
import { CareSchedule } from '../CareSchedule'

describe('CareSchedule', () => {
  const mockOnEdit = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders care schedule section', () => {
    render(
      <CareSchedule
        wateringDays={3}
        wateringDate="Next: Monday"
        fertilizingDays={14}
        fertilizingDate="Next: Jan 20"
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByTestId('care-schedule')).toBeTruthy()
  })

  it('displays section header', () => {
    render(
      <CareSchedule
        wateringDays={3}
        wateringDate="Next: Monday"
        fertilizingDays={14}
        fertilizingDate="Next: Jan 20"
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('Care Schedule')).toBeTruthy()
  })

  it('displays watering card with days', () => {
    render(
      <CareSchedule
        wateringDays={3}
        wateringDate="Next: Monday"
        fertilizingDays={14}
        fertilizingDate="Next: Jan 20"
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByTestId('care-card-watering')).toBeTruthy()
    expect(screen.getByText('In 3 days')).toBeTruthy()
    expect(screen.getByText('Watering')).toBeTruthy()
  })

  it('displays fertilizing card with days', () => {
    render(
      <CareSchedule
        wateringDays={3}
        wateringDate="Next: Monday"
        fertilizingDays={14}
        fertilizingDate="Next: Jan 20"
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByTestId('care-card-fertilizing')).toBeTruthy()
    expect(screen.getByText('In 14 days')).toBeTruthy()
    expect(screen.getByText('Fertilizing')).toBeTruthy()
  })

  it('displays next dates', () => {
    render(
      <CareSchedule
        wateringDays={3}
        wateringDate="Next: Monday"
        fertilizingDays={14}
        fertilizingDate="Next: Jan 20"
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('Next: Monday')).toBeTruthy()
    expect(screen.getByText('Next: Jan 20')).toBeTruthy()
  })

  it('shows overdue state when days are negative', () => {
    render(
      <CareSchedule
        wateringDays={-2}
        wateringDate="Was due Jan 4"
        fertilizingDays={14}
        fertilizingDate="Next: Jan 20"
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('2 days overdue')).toBeTruthy()
    expect(screen.getByText('Was due Jan 4')).toBeTruthy()
  })

  it('calls onEdit when edit button pressed', () => {
    render(
      <CareSchedule
        wateringDays={3}
        wateringDate="Next: Monday"
        fertilizingDays={14}
        fertilizingDate="Next: Jan 20"
        onEdit={mockOnEdit}
      />
    )

    fireEvent.press(screen.getByText('Edit'))

    expect(mockOnEdit).toHaveBeenCalledTimes(1)
  })
})
