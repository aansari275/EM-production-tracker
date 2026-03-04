import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid, differenceInDays, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get current Indian fiscal year (April to March)
 * In Jan-Mar, returns previous calendar year
 */
export function getCurrentFiscalYear(): string {
  const now = new Date()
  const month = now.getMonth() // 0-11 (Jan=0, Apr=3)
  const year = now.getFullYear()
  const fiscalYear = month < 3 ? year - 1 : year
  return String(fiscalYear).slice(-2)
}

/**
 * Format OPS number for display
 * Converts OPS-YYXXX to EM-{fiscalYear}-XXX format
 * Uses Indian Financial Year (April to March)
 * e.g., OPS-251086 → EM-25-1086, OPS-25881 → EM-25-881
 */
export function formatOpsNo(opsNo: string | undefined | null): string {
  if (!opsNo) return '-'

  // Already in EM-YY-XXX format - return as is
  if (/^EM-\d{2}-/.test(opsNo)) {
    return opsNo
  }

  const currentYear = getCurrentFiscalYear()

  // Convert OPS-YYXXX to EM-{currentYear}-XXX
  const match = opsNo.match(/^OPS-(2[0-9])(\d+)$/i)
  if (match) {
    const sequence = match[2]
    return `EM-${currentYear}-${sequence}`
  }

  // Handle OPS numbers without year prefix (e.g., OPS-1086)
  const simpleMatch = opsNo.match(/^OPS-(\d+)$/i)
  if (simpleMatch) {
    const sequence = simpleMatch[1]
    return `EM-${currentYear}-${sequence}`
  }

  return opsNo
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

// ============== Gantt Timeline Utilities ==============

/**
 * Calculate days between two dates
 */
export function daysBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  try {
    const start = parseISO(startStr)
    const end = parseISO(endStr)
    if (!isValid(start) || !isValid(end)) return 0
    return differenceInDays(end, start)
  } catch {
    return 0
  }
}

/**
 * Convert a date to a percentage position within a range
 */
export function dateToPercent(dateStr: string, startStr: string, endStr: string): number {
  if (!dateStr || !startStr || !endStr) return 0
  try {
    const date = parseISO(dateStr)
    const start = parseISO(startStr)
    const end = parseISO(endStr)
    if (!isValid(date) || !isValid(start) || !isValid(end)) return 0

    const totalDays = differenceInDays(end, start)
    if (totalDays <= 0) return 0

    const dayPosition = differenceInDays(date, start)
    const percent = (dayPosition / totalDays) * 100
    return Math.max(0, Math.min(100, percent))
  } catch {
    return 0
  }
}

/**
 * Check if a stage is overdue (past target date but not completed)
 */
export function isStageOverdue(
  targetDate: string | null | undefined,
  status: 'pending' | 'in_progress' | 'completed',
  today: Date = new Date()
): boolean {
  if (!targetDate || status === 'completed') return false
  try {
    const target = parseISO(targetDate)
    if (!isValid(target)) return false
    return target < today
  } catch {
    return false
  }
}

/**
 * Get schedule status for an order
 */
export type ScheduleStatus = 'on_track' | 'at_risk' | 'behind'

export function getScheduleStatus(
  stages: Record<string, { status: 'pending' | 'in_progress' | 'completed'; actualDate?: string | null }> | undefined,
  tnaEntries: Array<{ stage: string; targetDate: string | null }>,
  today: Date = new Date()
): ScheduleStatus {
  if (!tnaEntries || tnaEntries.length === 0) return 'on_track'

  for (const entry of tnaEntries) {
    // Skip stages with no target date (N/A)
    if (!entry.targetDate) continue

    const stageData = stages?.[entry.stage]
    const status = stageData?.status || 'pending'

    try {
      const targetDate = parseISO(entry.targetDate)
      if (!isValid(targetDate)) continue

      // If past target and not completed = behind
      if (targetDate < today && status !== 'completed') {
        return 'behind'
      }

      // If within 3 days of target and still pending = at risk
      const daysToTarget = differenceInDays(targetDate, today)
      if (daysToTarget <= 3 && daysToTarget >= 0 && status === 'pending') {
        return 'at_risk'
      }
    } catch {
      continue
    }
  }

  return 'on_track'
}

/**
 * Calculate stage durations for Gantt chart display
 * Returns an array of objects with start/end percentages for each stage
 */
export interface StageDuration {
  stage: string
  startPercent: number
  widthPercent: number
  durationDays: number
  isNA: boolean
}

export function calculateStageDurations(
  totalDays: number,
  tnaEntries: Array<{ stage: string; targetDate: string | null }>,
  rawMaterialDays: number = 15
): StageDuration[] {
  if (!tnaEntries || tnaEntries.length === 0 || totalDays <= 0) {
    return []
  }

  // Filter out N/A stages (no target date)
  const activeStages = tnaEntries.filter(e => e.targetDate !== null)
  const naStages = new Set(tnaEntries.filter(e => e.targetDate === null).map(e => e.stage))

  if (activeStages.length === 0) {
    return tnaEntries.map(e => ({
      stage: e.stage,
      startPercent: 0,
      widthPercent: 0,
      durationDays: 0,
      isNA: true
    }))
  }

  // First stage (raw material) gets fixed duration
  const firstStageDays = Math.min(rawMaterialDays, totalDays * 0.25)
  const remainingDays = totalDays - firstStageDays
  const remainingStages = activeStages.length - 1

  // Distribute remaining days proportionally
  const daysPerStage = remainingStages > 0 ? remainingDays / remainingStages : 0

  const result: StageDuration[] = []
  let currentPercent = 0
  let stageIndex = 0

  for (const entry of tnaEntries) {
    if (naStages.has(entry.stage)) {
      result.push({
        stage: entry.stage,
        startPercent: currentPercent,
        widthPercent: 0,
        durationDays: 0,
        isNA: true
      })
      continue
    }

    const isFirstStage = stageIndex === 0
    const durationDays = isFirstStage ? firstStageDays : daysPerStage
    const widthPercent = (durationDays / totalDays) * 100

    result.push({
      stage: entry.stage,
      startPercent: currentPercent,
      widthPercent: Math.max(widthPercent, 2), // Minimum 2% width for visibility
      durationDays,
      isNA: false
    })

    currentPercent += widthPercent
    stageIndex++
  }

  return result
}

/**
 * Format date for Gantt display (short month format)
 */
export function formatGanttDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const date = parseISO(dateStr)
    if (!isValid(date)) return ''
    return format(date, 'dd MMM')
  } catch {
    return ''
  }
}
