import type { CSSProperties } from 'react'

export interface ScreenProps {
  readonly shot?: number
  readonly on?: boolean
}

export const screenClass = (name: string, on: boolean): string =>
  on ? `m-a-scr m-a-${name} is-on` : `m-a-scr m-a-${name}`

// React's CSSProperties has no slot for custom properties, and the sprite
// and task photos size themselves from --s, --sx and --sy.
export const cssVars = (
  vars: Record<string, string | number | undefined>
): CSSProperties => vars as CSSProperties

export function Mi({
  name,
  size,
  color,
  className,
}: {
  name: string
  size: number
  color?: string | undefined
  className?: string
}) {
  return (
    <svg
      className={className ? `i ${className}` : 'i'}
      style={cssVars({ '--s': `${size}px`, color })}
      aria-hidden="true"
    >
      <use href={`#mi-${name}`} />
    </svg>
  )
}

export function Toast() {
  return (
    <div className="m-a-toast" role="status" aria-live="polite">
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <b data-toast="" />
    </div>
  )
}
