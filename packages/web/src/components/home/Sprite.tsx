export function Sprite() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <symbol id="i-drop" viewBox="0 0 24 24">
          <path
            d="M12 2.5c3.6 4.3 6.5 8 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.5 8.4 6.8 12 2.5Z"
            fill="currentColor"
          />
        </symbol>
        <symbol id="i-spark" viewBox="0 0 24 24">
          <path
            d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"
            fill="currentColor"
          />
        </symbol>
        <symbol id="i-leaf" viewBox="0 0 24 24">
          <path
            d="M5 20c0-9 6-15 15-15 0 9-6 15-14 15M5 20l8-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#fff" />
          <path
            d="M7.5 12.5l3 3 6-6.5"
            stroke="var(--primary)"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  )
}

export const Icon = ({
  id,
  size,
  className,
}: {
  id: 'drop' | 'spark' | 'leaf' | 'check'
  size: number
  className?: string
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
  >
    <use href={`#i-${id}`} />
  </svg>
)
