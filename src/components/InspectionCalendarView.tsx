import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatOpsNo } from '@/lib/utils'
import { AlertTriangle, Loader2, CalendarCheck } from 'lucide-react'
import { useInspectionSchedules, get15DayRange, generate15DayCalendar, groupSchedulesByDate } from '@/hooks/useInspectionSchedules'
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

// OPS Card (read-only, simplified)
function OpsCard({ schedule }: { schedule: InspectionSchedule }) {
  const colors = statusColors[schedule.status]
  const companyStyle = companyColors[schedule.inspectionCompany]

  return (
    <div
      className={cn(
        'rounded-md border p-1.5 border-l-4',
        colors.bg,
        companyStyle.border
      )}
    >
      {/* OPS + Company */}
      <div className="flex items-center justify-between gap-1">
        <div className={cn('font-medium truncate text-xs', colors.text)}>
          {formatOpsNo(schedule.opsNo)}
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
      <div className="text-[10px] text-gray-600 truncate">
        {schedule.buyerCode}
        {schedule.totalPcs > 0 && (
          <span className="ml-1">{'\u2022'} {schedule.totalPcs} pcs</span>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-1 mt-0.5 text-[10px]">
        <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
        <span className={cn('capitalize', colors.text)}>{schedule.status}</span>
      </div>
    </div>
  )
}

// Day cell for desktop grid
function DayCell({
  day,
  schedules,
}: {
  day: { date: string; dayName: string; dayNum: number; month: string; isToday: boolean; isWeekend: boolean }
  schedules: InspectionSchedule[]
}) {
  // Clash detection
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
        day.isWeekend && 'bg-gray-100',
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
            <span className="text-xs text-gray-400">No inspections</span>
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

// Main calendar component
export function InspectionCalendarView() {
  const { startDate, endDate } = useMemo(() => get15DayRange(), [])
  const { data: schedules = [], isLoading } = useInspectionSchedules(startDate, endDate)

  const days = useMemo(() => generate15DayCalendar(), [])
  const schedulesByDate = useMemo(() => groupSchedulesByDate(schedules), [schedules])

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

  if (schedules.length === 0) {
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

      {/* Mobile: Vertical list */}
      <div className="md:hidden divide-y">
        {days.map(day => {
          const daySchedules = schedulesByDate.get(day.date) || []
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
                  <div className="py-2 text-xs text-gray-400">No inspections</div>
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
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-gray-600">Cancelled</span>
        </div>
      </div>
    </div>
  )
}
