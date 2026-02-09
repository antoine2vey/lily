import { useEffect, useState } from 'react'

/**
 * Delays showing a loading state to avoid flashing skeletons on fast responses.
 * Returns true only if `isLoading` has been true for longer than `delay` ms.
 */
export function useDelayedLoading(isLoading: boolean, delay = 300): boolean {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => setShowLoading(true), delay)
      return () => clearTimeout(timeout)
    }
    setShowLoading(false)
  }, [isLoading, delay])

  return showLoading
}
