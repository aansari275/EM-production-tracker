import { useMemo } from 'react'
import { cn, formatOpsNo } from '@/lib/utils'
import { AlertTriangle, Loader2, CalendarCheck, Clock } from 'lucide-react'
import {
  useInspectionSchedules,
  getExtendedRange,
  get15DayRange,
  generate15DayCalendar,
  groupSchedulesByDate,
  getTodayString,
} from '@/hooks/useInspectionSchedules'
import type { InspectionSchedule, InspectionStatus, CompanyCode } from '@/types'

// Status color map
const statusColors: Record<InspectionStatus, { bg: string; text: string; dot: string }> = {
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  rescheduled: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  cancelled: { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400' },
}

// Company color map
const companyColors: Record<CompanyCode, { border: string; badge: string; text: string }> = {
  EMPL: { border: 'border-l-blue-500', badge: 'bg-blue-100', text: 'text-blue-700' },
  EHI: { border: 'border-l-purple-500', badge: 'bg-purple-100', text: 'text-purple-700' },
}

// ============ OPS Card ============

function OpsCard({ schedule }: { schedule: InspectionSchedule }) {
  const colors = statusColors[schedule.status] || statusColors.scheduled
  const companyStyle = companyColors[schedule.inspectionCompany] || companyColors.EMPL

  return (
    <div
      className={cn(
        'rounded-md border p-2 border-l-4',
        colors.bg,
        companyStyle.border
      )}
    >
      {/* OPS + Company */}
      <div className="flex items-center justify-between gap-1">
        <div className={cn('font-mono font-medium truncate text-xs', colors.text)}>
          {schedule.opsNo?.startsWith('EM-') ? schedule.opsNo : formatOpsNo(schedule.opsNo)}
        </div>
        <span className={cn(
          'text-[9px] px-1 py-0.5 rounded font-medium shrink-0',
          companyStyle.badge,
          companyStyle.text
        )}>
          {schedule.inspectionCompany}
        </span>
      </div>

      {/* Buyer + Pcs */}
      <div className="text-[10px] text-gray-600 truncate mt-0.5">
        {schedule.buyerCode}
        {schedule.totalPcs > 0 && (
          <span className="ml-1">{'\u2022'} {schedule.totalPcs.toLocaleString()} pcs</span>
        )}
      </div>

      {/* Article */}
      {schedule.articleName && (
        <div className="text-[10px] text-gray-500 truncate">
          {schedule.articleName}
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-1 mt-0.5 text-[10px]">
        <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
        <span className={cn('capitalize', colors.text)}>{schedule.status}</span>
        {schedule.merchantCode && (
          <span className="text-gray-400 ml-auto">{schedule.merchantCode}</span>
        )}
      </div>
    </div>
  )
}

// ============ Day Cell (Desktop) ============

function DayCell({
  day,
  schedules,
}: {
  day: { date: string; dayName: string; dayNum: number; month: string; isToday: boolean; isWeekend: boolean }
  schedules: InspectionSchedule[]
}) {
  // Clash detection - multiple active buyers on same day
  const hasClash = useMemo(() => {
    const active = schedules.filter(s => s.status !== 'cancelled' && s.status !== 'completed')
    const uniqueBuyers = new Set(active.map(s => s.buyerCode))
    return uniqueBuyers.size > 1
  }, [schedules])

  return (
    <div className={cn(
      'min-w-[140px] border-r last:border-r-0 flex flex-col',
      day.isWeekend && 'bg-gray-50/50'
    )}>
      {/* Day Header */}
      <div className={cn(
        'px-2 py-1.5 border-b text-center',
        day.isToday && 'bg-blue-50',
        day.isWeekend && !day.isToday && 'bg-gray-100',
        hasClash && 'bg-amber-50 border-amber-300'
      )}>
        <div className={cn(
          'text-xs font-medium flex items-center justify-center gap-1',
          day.isToday ? 'text-blue-600' : 'text-gray-500',
          hasClash && 'text-amber-700'
        )}>
          {hasClash && <AlertTriangle className="w-3 h-3 text-amber-600" />}
          {day.dayName}
        </div>
        <div className={cn(
          'text-sm font-semibold',
          day.isToday ? 'text-blue-700' : 'text-gray-900',
          hasClash && 'text-amber-800'
        )}>
          {day.dayNum} {day.month}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto max-h-[400px]">
        {schedules.length === 0 ? (
          <div className="h-full min-h-[60px] flex items-center justify-center">
            <span className="text-[10px] text-gray-300">-</span>
          </div>
        ) : (
          schedules.map(schedule => (
            <OpsCard key={schedule.id} schedule={schedule} />
          ))
        )}
      </div>
    </div>
  )
}

// ============ Overdue Section ============

function OverdueSection({ schedules }: { schedules: InspectionSchedule[] }) {
  if (schedules.length === 0) return null

  return (
    <div className="border-b">
      <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm font-medium text-red-700">
          Overdue Inspections ({schedules.length})
        </span>
        <span className="text-xs text-red-500">Scheduled but not completed</span>
      </div>
      <div className="p-3 bg-red-50/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {schedules.map(schedule => (
            <div key={schedule.id} className="relative">
              <OpsCard schedule={schedule} />
              <div className="absolute top-1 right-1">
                <span className="text-[9px] px-1 py-0.5 bg-red-100 text-red-600 rounded font-medium">
                  {schedule.inspectionDate}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ Stats Bar ============

function StatsBar({ schedules, overdueCount }: { schedules: InspectionSchedule[]; overdueCount: number }) {
  const stats = useMemo(() => {
    let scheduled = 0, completed = 0, rescheduled = 0
    schedules.forEach(s => {
      if (s.status === 'completed') completed++
      else if (s.status === 'rescheduled') rescheduled++
      else if (s.status === 'scheduled') scheduled++
    })
    return { scheduled, completed, rescheduled }
  }, [schedules])

  return (
    <div className="px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-4 text-xs">
      {overdueCount > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-medium text-red-700">{overdueCount} overdue</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-gray-600">{stats.scheduled} scheduled</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-orange-500" />
        <span className="text-gray-600">{stats.rescheduled} rescheduled</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-gray-600">{stats.completed} completed</span>
      </div>
    </div>
  )
}

// ============ Main Calendar ============

export function InspectionCalendarView() {
  // Fetch extended range (7 days back + 14 days forward) to catch overdue + upcoming
  const { startDate: extStartDate, endDate: extEndDate } = useMemo(() => getExtendedRange(), [])
  const { data: allSchedules = [], isLoading } = useInspectionSchedules(extStartDate, extEndDate)

  const today = useMemo(() => getTodayString(), [])
  const days = useMemo(() => generate15DayCalendar(), [])

  // Split into overdue (past, still scheduled/rescheduled) and current
  const { overdueSchedules, calendarSchedules, schedulesByDate } = useMemo(() => {
    const overdue: InspectionSchedule[] = []
    const calendar: InspectionSchedule[] = []

    allSchedules.forEach(s => {
      if (s.inspectionDate < today && (s.status === 'scheduled' || s.status === 'rescheduled')) {
        overdue.push(s)
      }
      // Include all in calendar range for the grid
      if (s.inspectionDate >= today) {
        calendar.push(s)
      }
    })

    // Sort overdue by date (most recent first)
    overdue.sort((a, b) => b.inspectionDate.localeCompare(a.inspectionDate))

    return {
      overdueSchedules: overdue,
      calendarSchedules: calendar,
      schedulesByDate: groupSchedulesByDate(calendar),
    }
  }, [allSchedules, today])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-gray-500">Loading inspection schedules...</span>
        </div>
      </div>
    )
  }

  if (allSchedules.length === 0) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
        <CalendarCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">No inspections scheduled</p>
        <p className="text-sm text-muted-foreground">
          Schedule inspections from the Orders app
        </p>
      </div>
    )
  }

  const week1 = days.slice(0, 7)
  const week2 = days.slice(7)

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      {/* Stats Bar */}
      <StatsBar schedules={allSchedules} overdueCount={overdueSchedules.length} />

      {/* Overdue Section */}
      <OverdueSection schedules={overdueSchedules} />

      {/* Desktop: 2-week grid */}
      <div className="hidden md:flex flex-col">
        <div className="grid grid-cols-7 border-b">
          {week1.map(day => (
            <DayCell
              key={day.date}
              day={day}
              schedules={schedulesByDate.get(day.date) || []}
            />
          ))}
        </div>
        <div className="grid grid-cols-7">
          {week2.map(day => (
            <DayCell
              key={day.date}
              day={day}
              schedules={schedulesByDate.get(day.date) || []}
            />
          ))}
        </div>
      </div>

      {/* Mobile: Vertical list (only days with inspections + today) */}
      <div className="md:hidden divide-y">
        {days.map(day => {
          const daySchedules = schedulesByDate.get(day.date) || []
          // On mobile, skip empty days unless it's today
          if (daySchedules.length === 0 && !day.isToday) return null

          return (
            <div
              key={day.date}
              className={cn(
                'flex items-start gap-3 p-3',
                day.isToday && 'bg-blue-50',
                day.isWeekend && !day.isToday && 'bg-gray-50/50'
              )}
            >
              {/* Date column */}
              <div className={cn(
                'flex-shrink-0 w-12 text-center pt-0.5',
                day.isToday ? 'text-blue-600' : 'text-gray-500'
              )}>
                <div className="text-[10px] font-medium uppercase">{day.dayName}</div>
                <div className={cn(
                  'text-lg font-bold leading-tight',
                  day.isToday ? 'text-blue-700' : 'text-gray-900'
                )}>
                  {day.dayNum}
                </div>
                <div className="text-[10px] text-gray-400">{day.month}</div>
              </div>

              {/* Cards or empty */}
              <div className="flex-1 min-w-0">
                {daySchedules.length === 0 ? (
                  <div className="py-2 text-xs text-gray-400">Today - no inspections</div>
                ) : (
                  <div className="space-y-1.5">
                    {daySchedules.map(schedule => (
                      <OpsCard key={schedule.id} schedule={schedule} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="border-t px-4 py-2 bg-gray-50 flex flex-wrap items-center gap-3 md:gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-gray-600">Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-gray-600">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-gray-600">Rescheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-gray-600">Overdue</span>
        </div>
        <div className="ml-auto text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Read-only view. Schedule from Orders app.
        </div>
      </div>
    </div>
  )
}
