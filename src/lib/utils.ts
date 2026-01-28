import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid, differenceInDays, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format OPS number for display
 * Internal: OPS-25881 → Display: EM-26-881
 */
export function formatOpsNo(opsNo: string): string {
  if (!opsNo) return '-'

  // Extract numeric part from OPS number
  const match = opsNo.match(/OPS-(\d+)/)
  if (!match) return opsNo

  const numericPart = match[1]

  // Get current year (last 2 digits)
  const currentYear = new Date().getFullYear().toString().slice(-2)

  // Extract just the sequence number (remove embedded year if present)
  // Handle both formats: "25881" (year 25 + seq 881) and "881" (just seq)
  let sequence = numericPart
  if (numericPart.length > 4) {
    // Assume first 2 digits are year, rest is sequence
    sequence = numericPart.slice(2)
  }

  return `EM-${currentYear}-${sequence}`
}

/**
 * Format date for display (DD MMM YYYY)
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    const date = parseISO(dateStr)
    if (!isValid(date)) return '-'
    return format(date, 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

/**
 * Format date for display (DD MMM)
 */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    const date = parseISO(dateStr)
    if (!isValid(date)) return '-'
    return format(date, 'dd MMM')
  } catch {
    return dateStr
  }
}

/**
 * Calculate days left until a date
 * Returns negative number if overdue
 */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  try {
    const date = parseISO(dateStr)
    if (!isValid(date)) return null
    return differenceInDays(date, new Date())
  } catch {
    return null
  }
}

/**
 * Check if a date is within this week
 */
export function isThisWeek(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  try {
    const date = parseISO(dateStr)
    if (!isValid(date)) return false
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
    return isWithinInterval(date, { start: weekStart, end: weekEnd })
  } catch {
    return false
  }
}

/**
 * Check if a date is overdue (before today)
 */
export function isOverdue(dateStr: string | null | undefined): boolean {
  const days = daysUntil(dateStr)
  return days !== null && days < 0
}

/**
 * Get days left badge color
 */
export function getDaysLeftColor(daysLeft: number | null): string {
  if (daysLeft === null) return 'text-muted-foreground'
  if (daysLeft < 0) return 'text-red-600 font-medium'
  if (daysLeft <= 7) return 'text-amber-600 font-medium'
  if (daysLeft <= 14) return 'text-blue-600'
  return 'text-green-600'
}

/**
 * Get stage status color classes
 */
export function getStageStatusColor(status: 'pending' | 'in_progress' | 'completed'): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500 text-white'
    case 'in_progress':
      return 'bg-amber-500 text-white'
    case 'pending':
    default:
      return 'bg-gray-200 text-gray-600'
  }
}

/**
 * Get stage status icon background
 */
export function getStageStatusBg(status: 'pending' | 'in_progress' | 'completed'): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500'
    case 'in_progress':
      return 'bg-amber-500'
    case 'pending':
    default:
      return 'bg-gray-300'
  }
}
