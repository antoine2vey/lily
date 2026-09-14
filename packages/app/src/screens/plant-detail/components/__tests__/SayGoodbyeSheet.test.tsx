import { fireEvent, render, screen } from '@testing-library/react-native'
import { SayGoodbyeSheet } from '../SayGoodbyeSheet'

describe('SayGoodbyeSheet', () => {
  const onClose = jest.fn()
  const onConfirm = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('names the plant in the title', () => {
    render(
      <SayGoodbyeSheet
        visible
        plantName="Fernando"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByTestId('say-goodbye-title')).toHaveTextContent(
      'Say goodbye to Fernando?'
    )
  })

  it('confirms with the unknown cause by default and no note', () => {
    render(
      <SayGoodbyeSheet
        visible
        plantName="Fernando"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    fireEvent.press(screen.getByTestId('say-goodbye-confirm'))

    expect(onConfirm).toHaveBeenCalledWith({ cause: 'unknown' })
  })

  it('sends the selected cause and a trimmed note', () => {
    render(
      <SayGoodbyeSheet
        visible
        plantName="Fernando"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    fireEvent.press(screen.getByText('Overwatering'))
    fireEvent.changeText(
      screen.getByTestId('say-goodbye-note'),
      '  Too much love  '
    )
    fireEvent.press(screen.getByTestId('say-goodbye-confirm'))

    expect(onConfirm).toHaveBeenCalledWith({
      cause: 'overwatering',
      note: 'Too much love',
    })
  })
})
