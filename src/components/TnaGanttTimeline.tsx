import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  cn,
  daysBetween,
  dateToPercent,
  isStageOverdue,
  getScheduleStatus,
  calculateStageDurations,
  formatGanttDate,
  daysUntil
} from '@/lib/utils'
import type { TnaStage, TnaEntry, StageUpdate, StageStatus } from '@/types'
import { TNA_STAGES, TNA_STAGE_LABELS } from '@/types'
import { useUpdateStage } from '@/hooks/useProductionTracker'
import { CheckCircle2, AlertTriangle, XCircle, Calendar } from 'lucide-react'

interface TnaGanttTimelineProps {
  orderId: string
  opsNo: string
  startDate: string           // orderConfirmationDate
  endDate: string             // shipDate (ex-factory)
  tnaEntries?: TnaEntry[]
  stages?: Record<TnaStage, StageUpdate>
}

export function TnaGanttTimeline({
  orderId,
  opsNo,
  startDate,
  endDate,
  tnaEntries,
  stages
}: TnaGanttTimelineProps) {
  const updateStage = useUpdateStage()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Calculate total timeline duration
  const totalDays = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate])

  // Calculate today's position as percentage
  const todayPercent = useMemo(
    () => dateToPercent(todayStr, startDate, endDate),
    [todayStr, startDate, endDate]
  )

  // Days left until ex-factory
  const daysLeft = useMemo(() => daysUntil(endDate), [endDate])

  // Build TNA entries if not provided (use all stages with no target dates)
  const effectiveTnaEntries = useMemo(() => {
    if (tnaEntries && tnaEntries.length > 0) return tnaEntries
    // Default: all stages without specific dates
    return TNA_STAGES.map(stage => ({
      stage,
      targetDate: null
    }))
  }, [tnaEntries])

  // Calculate stage durations for Gantt display
  const stageDurations = useMemo(
    () => calculateStageDurations(totalDays, effectiveTnaEntries, 15),
    [totalDays, effectiveTnaEntries]
  )

  // Calculate progress
  const progressData = useMemo(() => {
    const activeStages = effectiveTnaEntries.filter(e => e.targetDate !== null)
    const completedCount = activeStages.filter(
      entry => stages?.[entry.stage as TnaStage]?.status === 'completed'
    ).length
    const totalActive = activeStages.length || TNA_STAGES.length
    const percent = Math.round((completedCount / totalActive) * 100)

    return { completed: completedCount, total: totalActive, percent }
  }, [effectiveTnaEntries, stages])

  // Get schedule status
  const scheduleStatus = useMemo(
    () => getScheduleStatus(stages, effectiveTnaEntries, today),
    [stages, effectiveTnaEntries, today]
  )

  // Handle status change
  const handleStatusChange = async (stage: TnaStage) => {
    const currentStatus = stages?.[stage]?.status || 'pending'

    // Cycle: pending -> in_progress -> completed -> pending
    const nextStatus: StageStatus =
      currentStatus === 'pending' ? 'in_progress' :
      currentStatus === 'in_progress' ? 'completed' : 'pending'

    try {
      await updateStage.mutateAsync({
        orderId,
        opsNo,
        stage,
        update: {
          status: nextStatus,
          actualDate: nextStatus === 'completed' ? todayStr : null
        }
      })
    } catch (error) {
      console.error('Failed to update stage:', error)
    }
  }

  // Get status badge styling
  const getStatusBadge = () => {
    switch (scheduleStatus) {
      case 'on_track':
        return {
          icon: CheckCircle2,
          label: 'On Track',
          className: 'bg-green-100 text-green-700 border-green-200'
        }
      case 'at_risk':
        return {
          icon: AlertTriangle,
          label: 'At Risk',
          className: 'bg-amber-100 text-amber-700 border-amber-200'
        }
      case 'behind':
        return {
          icon: XCircle,
          label: 'Behind Schedule',
          className: 'bg-red-100 text-red-700 border-red-200'
        }
    }
  }

  const statusBadge = getStatusBadge()
  const StatusIcon = statusBadge.icon

  return (
    <div className="mt-4 border-t pt-4">
      {/* Progress Summary */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <div className="font-medium text-gray-700">
          Progress: <span className="text-blue-600">{progressData.percent}%</span>
          <span className="text-gray-400 ml-1">
            ({progressData.completed}/{progressData.total} stages)
          </span>
        </div>

        <Badge variant="outline" className={cn('gap-1', statusBadge.className)}>
          <StatusIcon className="h-3 w-3" />
          {statusBadge.label}
        </Badge>

        {daysLeft !== null && (
          <div className={cn(
            'flex items-center gap-1',
            daysLeft < 0 && 'text-red-600 font-medium',
            daysLeft >= 0 && daysLeft <= 7 && 'text-amber-600',
            daysLeft > 7 && 'text-gray-500'
          )}>
            <Calendar className="h-3.5 w-3.5" />
            {daysLeft < 0 ? (
              <span>{Math.abs(daysLeft)} days overdue</span>
            ) : daysLeft === 0 ? (
              <span>Due today</span>
            ) : (
              <span>{daysLeft} days left</span>
            )}
          </div>
        )}
      </div>

      {/* Gantt Chart Container */}
      <div className="flex">
        {/* Stage Labels Column */}
        <div className="w-32 flex-shrink-0 space-y-1">
          {TNA_STAGES.map((stage, index) => {
            const tnaEntry = effectiveTnaEntries.find(e => e.stage === stage)
            const stageData = stages?.[stage]
            const status: StageStatus = stageData?.status || 'pending'
            const isNA = tnaEntry?.targetDate === null
            const overdue = isStageOverdue(tnaEntry?.targetDate, status, today)

            return (
              <div
                key={stage}
                className="h-6 flex items-center gap-1.5"
              >
                <span className={cn(
                  'text-xs font-mono w-4 flex-shrink-0',
                  overdue ? 'text-red-600 font-semibold' : 'text-gray-500'
                )}>
                  {index + 1}.
                </span>
                <span className={cn(
                  'text-xs truncate',
                  isNA && 'text-gray-400 italic',
                  !isNA && status === 'completed' && 'text-green-700 font-medium',
                  !isNA && status === 'in_progress' && 'text-amber-700 font-medium',
                  !isNA && status === 'pending' && !overdue && 'text-gray-600',
                  !isNA && overdue && 'text-red-700 font-medium'
                )}>
                  {TNA_STAGE_LABELS[stage]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Gantt Bars Area */}
        <div className="flex-1 relative min-w-0">
          {/* Date Header */}
          <div className="h-6 flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span className="font-medium">{formatGanttDate(startDate)}</span>
            <span className="font-medium">{formatGanttDate(endDate)}</span>
          </div>

          {/* Chart Area with Today Marker */}
          <div className="relative">
            {/* Today Marker */}
            {todayPercent > 0 && todayPercent < 100 && (
              <div
                className="absolute top-0 bottom-0 z-10 flex flex-col items-center pointer-events-none"
                style={{ left: `${todayPercent}%` }}
              >
                <div className="absolute -top-6 -translate-x-1/2 bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded-sm font-medium whitespace-nowrap">
                  TODAY
                </div>
                <div className="w-0.5 h-full bg-blue-500 opacity-60" />
              </div>
            )}

            {/* Stage Bars */}
            <div className="space-y-1">
              {TNA_STAGES.map((stage, index) => {
                const duration = stageDurations.find(d => d.stage === stage)
                const tnaEntry = effectiveTnaEntries.find(e => e.stage === stage)
                const stageData = stages?.[stage]
                const status: StageStatus = stageData?.status || 'pending'
                const isNA = tnaEntry?.targetDate === null
                const overdue = isStageOverdue(tnaEntry?.targetDate, status, today)

                return (
                  <GanttBar
                    key={stage}
                    startPercent={duration?.startPercent || 0}
                    widthPercent={duration?.widthPercent || 0}
                    status={status}
                    isOverdue={overdue}
                    isNA={isNA}
                    durationDays={duration?.durationDays || 0}
                    onClick={() => handleStatusChange(stage)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t flex flex-wrap gap-4 text-[10px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-400" />
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gray-200 border border-gray-300" />
          <span>Pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-400" />
          <span>Overdue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400 italic">N/A</span>
          <span>= Not Applicable</span>
        </div>
      </div>

      {/* Click hint */}
      <p className="mt-2 text-[10px] text-gray-400 italic">
        Click any stage bar to cycle status: Pending → In Progress → Completed
      </p>
    </div>
  )
}

// Inline GanttBar component for cleaner rendering
interface GanttBarProps {
  startPercent: number
  widthPercent: number
  status: StageStatus
  isOverdue: boolean
  isNA: boolean
  durationDays: number
  onClick: () => void
}

function GanttBar({
  startPercent,
  widthPercent,
  status,
  isOverdue,
  isNA,
  durationDays,
  onClick
}: GanttBarProps) {
  if (isNA) {
    return (
      <div className="h-6 relative">
        <div
          className="absolute top-1/2 -translate-y-1/2 text-[10px] text-gray-400 italic"
          style={{ left: `${Math.max(startPercent, 2)}%` }}
        >
          N/A
        </div>
      </div>
    )
  }

  // Determine bar colors based on status
  const getBarClasses = () => {
    if (isOverdue) return 'bg-red-200 border-red-400 hover:bg-red-300'
    switch (status) {
      case 'completed':
        return 'bg-green-500 border-green-600 hover:bg-green-600'
      case 'in_progress':
        return 'bg-amber-400 border-amber-500 hover:bg-amber-500'
      default:
        return 'bg-gray-200 border-gray-300 hover:bg-gray-300'
    }
  }

  const getTextClasses = () => {
    if (isOverdue) return 'text-red-800'
    switch (status) {
      case 'completed':
        return 'text-white'
      case 'in_progress':
        return 'text-amber-900'
      default:
        return 'text-gray-600'
    }
  }

  const getIcon = () => {
    if (isOverdue) return '!'
    switch (status) {
      case 'completed':
        return '✓'
      case 'in_progress':
        return '◐'
      default:
        return ''
    }
  }

  return (
    <div className="h-6 relative">
      <button
        onClick={onClick}
        className={cn(
          'absolute top-0 h-6 rounded border transition-all cursor-pointer',
          'flex items-center justify-center gap-0.5 overflow-hidden',
          getBarClasses()
        )}
        style={{
          left: `${startPercent}%`,
          width: `${Math.max(widthPercent, 4)}%`,
          minWidth: '32px'
        }}
        title={`Click to update status (${status})`}
      >
        {getIcon() && (
          <span className={cn('text-[10px] font-bold', getTextClasses())}>
            {getIcon()}
          </span>
        )}
        {widthPercent > 8 && (
          <span className={cn('text-[10px] font-medium', getTextClasses())}>
            {Math.round(durationDays)}d
          </span>
        )}
      </button>
    </div>
  )
}
