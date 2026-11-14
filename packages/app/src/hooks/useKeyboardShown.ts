import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

const KEYBOARD_EVENTS =
  Platform.OS === 'ios'
    ? ({ show: 'keyboardWillShow', hide: 'keyboardWillHide' } as const)
    : ({ show: 'keyboardDidShow', hide: 'keyboardDidHide' } as const)

export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener(KEYBOARD_EVENTS.show, () =>
      setShown(true)
    )
    const hide = Keyboard.addListener(KEYBOARD_EVENTS.hide, () =>
      setShown(false)
    )
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  return shown
}
