// Format a wire date string (ISO) as a short human date, e.g. "Jan 15, 2026".
export const formatShortDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
