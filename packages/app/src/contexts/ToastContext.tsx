import { Option } from 'effect'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'

type ToastAction = {
  label: string
  onPress: () => void
}

type ToastState = {
  visible: boolean
  message: string
  action: Option.Option<ToastAction>
  id: string
}

interface ToastContextValue {
  state: ToastState
  showToast: (options: {
    message: string
    action?: ToastAction
    duration?: number
  }) => string
  hideToast: (id: string) => void
}

const initialState: ToastState = {
  visible: false,
  message: '',
  action: Option.none(),
  id: '',
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

type ToastProviderProps = {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [state, setState] = useState<ToastState>(initialState)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hideToast = useCallback((id: string) => {
    setState((current) => {
      if (current.id === id) {
        return initialState
      }
      return current
    })
  }, [])

  const showToast = useCallback(
    (options: {
      message: string
      action?: ToastAction
      duration?: number
    }): string => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      const id = `toast-${Date.now()}`
      const duration = options.duration ?? 4000

      setState({
        visible: true,
        message: options.message,
        action: Option.fromNullable(options.action),
        id,
      })

      // Auto-dismiss after duration
      timeoutRef.current = setTimeout(() => {
        hideToast(id)
      }, duration)

      return id
    },
    [hideToast]
  )

  return (
    <ToastContext.Provider value={{ state, showToast, hideToast }}>
      {children}
    </ToastContext.Provider>
  )
}
