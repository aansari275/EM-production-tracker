import { useQuery } from '@tanstack/react-query'
import type { InspectionSchedule } from '@/types'

interface InspectionSchedulesResponse {
  schedules: InspectionSchedule[]
}

// Helper: Format date as local YYYY-MM-DD (avoids UTC shift from toISOString)
function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Helper: Get 15-day date range starting from today
export function get15DayRange(): { startDate: string; endDate: string } {
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 14)

  return {
    startDate: toLocalDateString(today),
    endDate: toLocalDateString(endDate),
  }
}

// Helper: Generate array of 15 days for calendar
export function generate15DayCalendar(): Array<{
  date: string
  dayName: string
  dayNum: number
  month: string
  isToday: boolean
  isWeekend: boolean
}> {
  const days: Array<{
    date: string
    dayName: string
    dayNum: number
    month: string
    isToday: boolean
    isWeekend: boolean
  }> = []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 15; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + i)

    const dayOfWeek = date.getDay()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    days.push({
      date: toLocalDateString(date),
      dayName: dayNames[dayOfWeek],
      dayNum: date.getDate(),
      month: monthNames[date.getMonth()],
      isToday: i === 0,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    })
  }

  return days
}

// Helper: Group schedules by date
export function groupSchedulesByDate(schedules: InspectionSchedule[]): Map<string, InspectionSchedule[]> {
  const grouped = new Map<string, InspectionSchedule[]>()

  schedules.forEach(schedule => {
    const date = schedule.inspectionDate
    const existing = grouped.get(date) || []
    existing.push(schedule)
    grouped.set(date, existing)
  })

  return grouped
}

// Fetch inspection schedules for a date range
export function useInspectionSchedules(startDate: string, endDate: string) {
  return useQuery<InspectionSchedule[]>({
    queryKey: ['inspection-schedules', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/inspection-schedules?${params}`)
      if (!res.ok) throw new Error('Failed to fetch inspection schedules')
      const data: InspectionSchedulesResponse = await res.json()
      return data.schedules
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
