// Parses "30 days", "6 weeks", "1 month", "2 years" (case/spacing tolerant) into days.
// Months and years are approximated (30 and 365 days) — good enough for renewal-notice math.
export function parsePeriodToDays(period: string | null | undefined): number | null {
  if (!period) return null
  const match = period.trim().toLowerCase().match(/(\d+)\s*(day|week|month|year)s?\b/)
  if (!match) return null
  const n = Number.parseInt(match[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  switch (match[2]) {
    case 'day':
      return n
    case 'week':
      return n * 7
    case 'month':
      return n * 30
    case 'year':
      return n * 365
    default:
      return null
  }
}

// Returns a YYYY-MM-DD string or null. Never mutates input.
function shiftDate(isoDate: string, deltaDays: number): string | null {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export function computeDerivedDates({
  expiryDate,
  noticePeriod,
}: {
  expiryDate: string | null
  noticePeriod: string | null
}): { renewalNoticeDate: string | null; renewalDate: string | null } {
  const renewalDate = expiryDate ? shiftDate(expiryDate, 1) : null
  const noticeDays = parsePeriodToDays(noticePeriod)
  const renewalNoticeDate =
    expiryDate && noticeDays !== null ? shiftDate(expiryDate, -noticeDays) : null
  return { renewalNoticeDate, renewalDate }
}
