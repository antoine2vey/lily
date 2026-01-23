import { act, renderHook } from '@testing-library/react-native'
import { Option } from 'effect'
import type { ReactNode } from 'react'
import React from 'react'
import { ToastProvider, useToast } from '../ToastContext'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
)

describe('ToastContext', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('useToast hook', () => {
    it('throws when used outside provider', () => {
      expect(() => {
        renderHook(() => useToast())
      }).toThrow('useToast must be used within a ToastProvider')
    })

    it('provides initial state', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      expect(result.current.state.visible).toBe(false)
      expect(result.current.state.message).toBe('')
      expect(Option.isNone(result.current.state.action)).toBe(true)
      expect(result.current.state.id).toBe('')
    })

    it('provides showToast function', () => {
      const { result } = renderHook(() => useToast(), { wrapper })
      expect(typeof result.current.showToast).toBe('function')
    })

    it('provides hideToast function', () => {
      const { result } = renderHook(() => useToast(), { wrapper })
      expect(typeof result.current.hideToast).toBe('function')
    })
  })

  describe('showToast', () => {
    it('shows toast with message', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.showToast({ message: 'Test message' })
      })

      expect(result.current.state.visible).toBe(true)
      expect(result.current.state.message).toBe('Test message')
    })

    it('returns toast id', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      let toastId: string
      act(() => {
        toastId = result.current.showToast({ message: 'Test' })
      })

      expect(toastId!).toMatch(/^toast-\d+$/)
    })

    it('shows toast with action', () => {
      const { result } = renderHook(() => useToast(), { wrapper })
      const action = { label: 'Undo', onPress: jest.fn() }

      act(() => {
        result.current.showToast({ message: 'Action toast', action })
      })

      expect(result.current.state.visible).toBe(true)
      expect(Option.isSome(result.current.state.action)).toBe(true)
    })

    it('auto-dismisses after default duration', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.showToast({ message: 'Auto dismiss' })
      })

      expect(result.current.state.visible).toBe(true)

      act(() => {
        jest.advanceTimersByTime(4000)
      })

      expect(result.current.state.visible).toBe(false)
    })

    it('respects custom duration', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.showToast({ message: 'Custom duration', duration: 2000 })
      })

      expect(result.current.state.visible).toBe(true)

      act(() => {
        jest.advanceTimersByTime(1500)
      })

      expect(result.current.state.visible).toBe(true)

      act(() => {
        jest.advanceTimersByTime(1000)
      })

      expect(result.current.state.visible).toBe(false)
    })

    it('replaces existing toast', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.showToast({ message: 'First toast' })
      })

      expect(result.current.state.message).toBe('First toast')

      act(() => {
        result.current.showToast({ message: 'Second toast' })
      })

      expect(result.current.state.message).toBe('Second toast')
    })
  })

  describe('hideToast', () => {
    it('hides toast with matching id', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      let toastId: string
      act(() => {
        toastId = result.current.showToast({ message: 'Test' })
      })

      expect(result.current.state.visible).toBe(true)

      act(() => {
        result.current.hideToast(toastId!)
      })

      expect(result.current.state.visible).toBe(false)
    })

    it('does not hide toast with non-matching id', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.showToast({ message: 'Test' })
      })

      expect(result.current.state.visible).toBe(true)

      act(() => {
        result.current.hideToast('wrong-id')
      })

      expect(result.current.state.visible).toBe(true)
    })

    it('resets state when hidden', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      let toastId: string
      act(() => {
        toastId = result.current.showToast({
          message: 'Test',
          action: { label: 'Undo', onPress: jest.fn() },
        })
      })

      act(() => {
        result.current.hideToast(toastId!)
      })

      expect(result.current.state.visible).toBe(false)
      expect(result.current.state.message).toBe('')
      expect(Option.isNone(result.current.state.action)).toBe(true)
    })
  })

  describe('ToastProvider', () => {
    it('renders children', () => {
      const { result } = renderHook(() => useToast(), { wrapper })
      expect(result.current).toBeTruthy()
    })
  })
})
