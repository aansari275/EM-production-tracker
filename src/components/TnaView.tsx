import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { OrderWithTracker, TnaStage, StageStatus } from '@/types'
import { TNA_STAGES, TNA_STAGE_LABELS, TNA_STAGE_SHORT_LABELS } from '@/types'
import { formatOpsNo, formatDateShort, cn, isOverdue as checkOverdue, getScheduleStatus, deriveErpStageStatuses, erpPcsLabel } from '@/lib/utils'
import { useUpdateStage } from '@/hooks/useProductionTracker'
import { useOrder } from '@/hooks/useOrders'
import { useProductionStatus } from '@/hooks/useProductionStatus'
import { useErpTnaStages, type ErpStageData } from '@/hooks/useErpTnaStages'
import { TnaGanttTimeline } from './TnaGanttTimeline'
import {
  Package,
  Loader2,
  Check,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from 'lucide-react'

interface TnaViewProps {
  orders: OrderWithTracker[]
  isLoading: boolean
}

// Custom hook for responsive design
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

export function TnaView({ orders, isLoading }: TnaViewProps) {
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()
  const { data: erpStagesMap } = useErpTnaStages()

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Loading TNA data...</p>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="p-12 text-center">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">No open orders</p>
        <p className="text-sm text-muted-foreground">
          All orders are either completed or not yet sent to production
        </p>
      </div>
    )
  }

  const toggleOps = (orderId: string) => {
    const newExpanded = new Set(expandedOps)
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId)
    } else {
      newExpanded.add(orderId)
    }
    setExpandedOps(newExpanded)
  }

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-3">
        {orders.map((order) => {
          const isExpanded = expandedOps.has(order.id)
          const opsNo = formatOpsNo(order.salesNo)
          const totalPcs = order.totalPcs || order.items?.reduce((sum, i) => sum + (i.pcs || 0), 0) || 0

          return (
            <Card key={order.id} className="overflow-hidden">
              {/* Order Header */}
              <div
                className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleOps(order.id)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg">{opsNo}</span>
                        <Badge variant={order.companyCode === 'EMPL' ? 'default' : 'secondary'}>
                          {order.companyCode}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {order.customerCode} • {order.items?.length || 0} items • {totalPcs} pcs
                      </div>
                    </div>
                  </div>

                  {/* Compact Progress Bar (collapsed view) */}
                  {!isExpanded && (
                    <div className="hidden md:block flex-1 max-w-md px-4">
                      <CompactProgressBar orderId={order.id} />
                    </div>
                  )}

                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium">Ex-Factory</div>
                    <div className={cn(
                      'font-bold',
                      checkOverdue(order.shipDate) && 'text-red-600'
                    )}>
                      {formatDateShort(order.shipDate)}
                    </div>
                  </div>
                </div>
              </div>

              {/* TNA Timeline (expanded) */}
              {isExpanded && (
                <CardContent className="p-4 pt-0">
                  <TnaTimelineWrapper
                    orderId={order.id}
                    opsNo={opsNo}
                    poDate={order.orderConfirmationDate}
                    exFactoryDate={order.shipDate}
                    isMobile={isMobile}
                    erpData={erpStagesMap?.[formatOpsNo(order.salesNo)] || undefined}
                  />
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </ScrollArea>
  )
}

// Wrapper component that fetches order data and uses real-time Firebase listener
function TnaTimelineWrapper({
  orderId,
  opsNo,
  poDate,
  exFactoryDate,
  isMobile,
  erpData
}: {
  orderId: string
  opsNo: string
  poDate: string
  exFactoryDate: string
  isMobile: boolean
  erpData?: ErpStageData
}) {
  const { data: orderData, isLoading } = useOrder(orderId)
  // Real-time Firebase listener for live stage data
  const { data: liveTracker } = useProductionStatus(orderId)

  if (isLoading) {
    return (
      <div className="mt-4 border-t pt-4 flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading timeline...</span>
      </div>
    )
  }

  // Use order confirmation date if available, otherwise fall back to poDate
  const startDate = orderData?.orderConfirmationDate || poDate
  const endDate = orderData?.shipDate || exFactoryDate

  // Merge live Firebase stage data over API-provided tracker data
  const firestoreStages = liveTracker?.stages || orderData?.tracker?.stages

  // Merge ERP-derived stages with Firestore stages
  // ERP as base, Firestore manual overrides take priority
  const todayStr = new Date().toISOString().split('T')[0]
  let mergedStages = firestoreStages

  if (erpData) {
    const erpDerived = deriveErpStageStatuses(erpData)
    const merged: Record<string, { status: StageStatus; actualDate?: string | null; notes?: string; updatedAt?: string }> = {}

    for (const stageKey of TNA_STAGES) {
      const fsStage = firestoreStages?.[stageKey]
      const erpStage = erpDerived[stageKey]

      if (fsStage && fsStage.status !== 'pending') {
        // Firestore manual override takes priority (if not just default pending)
        merged[stageKey] = fsStage
      } else if (erpStage) {
        // Use ERP-derived status with actual date
        merged[stageKey] = {
          status: erpStage.status,
          actualDate: erpStage.actualDate || (erpStage.status === 'completed' ? todayStr : null),
        }
      } else if (fsStage) {
        merged[stageKey] = fsStage
      } else {
        merged[stageKey] = { status: 'pending', actualDate: null }
      }
    }

    mergedStages = merged as any
  }

  // Get TNA entries from order
  const tnaEntries = orderData?.tna?.entries

  // On mobile, show vertical timeline for better usability
  if (isMobile) {
    return (
      <TnaTimelineVertical
        orderId={orderId}
        opsNo={opsNo}
        stages={mergedStages}
        tnaEntries={tnaEntries}
        erpData={erpData}
      />
    )
  }

  // Desktop: show Gantt timeline
  return (
    <TnaGanttTimeline
      orderId={orderId}
      opsNo={opsNo}
      startDate={startDate}
      endDate={endDate}
      tnaEntries={tnaEntries}
      stages={mergedStages}
      erpData={erpData}
    />
  )
}

// Vertical timeline for mobile view (original design)
function TnaTimelineVertical({
  orderId,
  opsNo,
  stages,
  tnaEntries,
  erpData
}: {
  orderId: string
  opsNo: string
  stages?: Record<TnaStage, { status: StageStatus; actualDate?: string | null }>
  tnaEntries?: Array<{ stage: TnaStage; targetDate: string | null }>
  erpData?: ErpStageData
}) {
  const updateStage = useUpdateStage()

  // Build stage data
  const stageData = TNA_STAGES.map(stage => {
    const tnaEntry = tnaEntries?.find(e => e.stage === stage)
    const stageUpdate = stages?.[stage]

    return {
      stage,
      label: TNA_STAGE_LABELS[stage],
      status: (stageUpdate?.status || 'pending') as StageStatus,
      targetDate: tnaEntry?.targetDate || null,
      actualDate: stageUpdate?.actualDate || null,
      isNA: tnaEntry?.targetDate === null
    }
  })

  const handleStatusChange = async (stage: TnaStage, currentStatus: StageStatus) => {
    // Cycle through statuses: pending -> in_progress -> completed -> pending
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
          actualDate: nextStatus === 'completed' ? new Date().toISOString().split('T')[0] : null
        }
      })
    } catch (error) {
      console.error('Failed to update stage:', error)
    }
  }

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="text-sm font-semibold mb-4">TNA Timeline</h4>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {stageData.map((data, index) => (
            <div key={data.stage} className="relative flex items-start gap-4 pl-10">
              {/* Status indicator */}
              <div
                className={cn(
                  'absolute left-2 w-5 h-5 rounded-full flex items-center justify-center',
                  'border-2 bg-white cursor-pointer transition-colors',
                  data.isNA && 'bg-gray-50 border-gray-200 cursor-default',
                  !data.isNA && data.status === 'completed' && 'bg-green-500 border-green-500',
                  !data.isNA && data.status === 'in_progress' && 'bg-amber-500 border-amber-500',
                  !data.isNA && data.status === 'pending' && 'border-gray-300 hover:border-gray-400'
                )}
                onClick={() => !data.isNA && handleStatusChange(data.stage, data.status)}
              >
                {data.isNA ? (
                  <span className="text-[8px] text-gray-400">N/A</span>
                ) : data.status === 'completed' ? (
                  <Check className="h-3 w-3 text-white" />
                ) : data.status === 'in_progress' ? (
                  <Clock className="h-3 w-3 text-white" />
                ) : (
                  <Circle className="h-3 w-3 text-gray-300" />
                )}
              </div>

              {/* Stage content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500 mr-2">
                      {index + 1}.
                    </span>
                    <span className={cn(
                      'text-sm font-medium',
                      data.isNA && 'text-gray-400 italic',
                      !data.isNA && data.status === 'completed' && 'text-green-700',
                      !data.isNA && data.status === 'in_progress' && 'text-amber-700',
                      !data.isNA && data.status === 'pending' && 'text-gray-600'
                    )}>
                      {data.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    {erpData && erpPcsLabel(erpData, data.stage) && (
                      <div className="text-blue-600 font-medium">
                        {erpPcsLabel(erpData, data.stage)}
                      </div>
                    )}
                    {data.targetDate && (
                      <div className="text-muted-foreground">
                        Target: {formatDateShort(data.targetDate)}
                      </div>
                    )}
                    {data.actualDate && (
                      <div className="text-green-600 font-medium">
                        Done: {formatDateShort(data.actualDate)}
                      </div>
                    )}
                    {!data.isNA && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          data.status === 'completed' && 'border-green-500 text-green-700 bg-green-50',
                          data.status === 'in_progress' && 'border-amber-500 text-amber-700 bg-amber-50',
                          data.status === 'pending' && 'border-gray-300 text-gray-500'
                        )}
                      >
                        {data.status === 'completed' ? 'Done' :
                         data.status === 'in_progress' ? 'In Progress' : 'Pending'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Click hint */}
      <p className="mt-4 text-[10px] text-gray-400 italic text-center">
        Tap status circle to cycle: Pending → In Progress → Completed
      </p>
    </div>
  )
}

// Compact progress bar for collapsed view
function CompactProgressBar({ orderId }: { orderId: string }) {
  const { data: orderData, isLoading } = useOrder(orderId)

  const progressData = useMemo(() => {
    if (!orderData) return null

    const stages = orderData.tracker?.stages
    const tnaEntries = orderData.tna?.entries || []

    // Count active stages (not N/A)
    const activeStages = tnaEntries.length > 0
      ? tnaEntries.filter(e => e.targetDate !== null)
      : TNA_STAGES.map(s => ({ stage: s, targetDate: 'dummy' }))

    // Count completed stages
    const completedCount = activeStages.filter(
      entry => stages?.[entry.stage as TnaStage]?.status === 'completed'
    ).length

    // Find current stage (first non-completed)
    let currentStage: TnaStage | null = null
    for (const entry of activeStages) {
      const status = stages?.[entry.stage as TnaStage]?.status || 'pending'
      if (status !== 'completed') {
        currentStage = entry.stage as TnaStage
        break
      }
    }

    // If all completed, show dispatch
    if (!currentStage && completedCount > 0) {
      currentStage = 'dispatch'
    }

    const totalActive = activeStages.length || TNA_STAGES.length
    const percent = Math.round((completedCount / totalActive) * 100)

    // Get schedule status
    const scheduleStatus = getScheduleStatus(stages, tnaEntries, new Date())

    return {
      percent,
      completed: completedCount,
      total: totalActive,
      currentStage,
      scheduleStatus
    }
  }, [orderData])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full w-1/4 bg-gray-300 animate-pulse rounded-full" />
        </div>
      </div>
    )
  }

  if (!progressData) return null

  const { percent, currentStage, scheduleStatus } = progressData

  // Status icon and color
  const getStatusIndicator = () => {
    switch (scheduleStatus) {
      case 'on_track':
        return { icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-500' }
      case 'at_risk':
        return { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-500' }
      case 'behind':
        return { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-500' }
    }
  }

  const status = getStatusIndicator()
  const StatusIcon = status.icon

  return (
    <div className="flex items-center gap-3">
      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', status.bgColor)}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Progress info */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusIcon className={cn('h-4 w-4', status.color)} />
        <span className="text-xs font-medium text-gray-600">
          {percent}%
        </span>
        {currentStage && (
          <span className="text-xs text-gray-500 hidden lg:inline">
            • {TNA_STAGE_SHORT_LABELS[currentStage]}
          </span>
        )}
      </div>
    </div>
  )
}
