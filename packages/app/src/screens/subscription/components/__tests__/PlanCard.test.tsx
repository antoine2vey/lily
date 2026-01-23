import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { PlanCard } from '../PlanCard'

describe('PlanCard', () => {
  it('renders plan name', () => {
    render(
      <PlanCard planName="Pro" status="active">
        <Text>Plan details</Text>
      </PlanCard>
    )

    expect(screen.getByText('Pro')).toBeTruthy()
  })

  it('displays current plan label', () => {
    render(
      <PlanCard planName="Pro" status="active">
        <Text>Plan details</Text>
      </PlanCard>
    )

    expect(screen.getByText('Current Plan')).toBeTruthy()
  })

  it('renders children content', () => {
    render(
      <PlanCard planName="Pro" status="active">
        <Text>Custom plan content</Text>
      </PlanCard>
    )

    expect(screen.getByText('Custom plan content')).toBeTruthy()
  })

  it('shows active badge', () => {
    render(
      <PlanCard planName="Pro" status="active">
        <Text>Content</Text>
      </PlanCard>
    )

    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('shows trial badge', () => {
    render(
      <PlanCard planName="Pro" status="trialing">
        <Text>Content</Text>
      </PlanCard>
    )

    expect(screen.getByText('Trial')).toBeTruthy()
  })

  it('shows canceled badge', () => {
    render(
      <PlanCard planName="Pro" status="canceled">
        <Text>Content</Text>
      </PlanCard>
    )

    expect(screen.getByText('Canceled')).toBeTruthy()
  })

  it('shows past due badge', () => {
    render(
      <PlanCard planName="Pro" status="past_due">
        <Text>Content</Text>
      </PlanCard>
    )

    expect(screen.getByText('Past Due')).toBeTruthy()
  })
})
