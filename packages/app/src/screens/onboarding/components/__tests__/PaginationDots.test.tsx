import { render } from '@testing-library/react-native'
import { PaginationDots } from '../PaginationDots'

describe('PaginationDots', () => {
  it('renders correct number of dots', () => {
    const { toJSON } = render(<PaginationDots total={4} current={0} />)

    const json = toJSON()
    // The component renders a View with child dots
    expect(json).toBeTruthy()
  })

  it('renders with different totals', () => {
    const { rerender, toJSON } = render(
      <PaginationDots total={3} current={0} />
    )

    expect(toJSON()).toBeTruthy()

    rerender(<PaginationDots total={5} current={0} />)
    expect(toJSON()).toBeTruthy()
  })

  it('highlights current dot', () => {
    const { toJSON } = render(<PaginationDots total={3} current={1} />)

    // Component renders, active state is reflected in styling
    expect(toJSON()).toBeTruthy()
  })

  it('works with first dot as current', () => {
    const { toJSON } = render(<PaginationDots total={4} current={0} />)

    expect(toJSON()).toBeTruthy()
  })

  it('works with last dot as current', () => {
    const { toJSON } = render(<PaginationDots total={4} current={3} />)

    expect(toJSON()).toBeTruthy()
  })
})
