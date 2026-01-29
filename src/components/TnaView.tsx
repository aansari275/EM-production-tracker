import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ProductionRow, TnaStage, StageStatus } from '@/types'
import { TNA_STAGES, TNA_STAGE_LABELS } from '@/types'
import { formatDateShort, cn, isOverdue as checkOverdue } from '@/lib/utils'
import { useUpdateStage } from '@/hooks/useProductionTracker'
import { useOrder } from '@/hooks/useOrders'
import { TnaGanttTimeline } from './TnaGanttTimeline'
import {
  Package,
  Loader2,
  Check,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight
} from 'lucide-react'

interface TnaViewProps {
  rows: ProductionRow[]
  isLoading: boolean
}

// Group rows by OPS number for TNA view
function groupByOps(rows: ProductionRow[]): Map<string, ProductionRow[]> {
  const grouped = new Map<string, ProductionRow[]>()
  rows.forEach(row => {
    const existing = grouped.get(row.opsNo) || []
    existing.push(row)
    grouped.set(row.opsNo, existing)
  })
  return grouped
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

export function TnaView({ rows, isLoading }: TnaViewProps) {
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Loading TNA data...</p>
      </div>
    )
  }

  if (rows.length === 0) {
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

  const groupedOrders = groupByOps(rows)

  const toggleOps = (opsNo: string) => {
    const newExpanded = new Set(expandedOps)
    if (newExpanded.has(opsNo)) {
      newExpanded.delete(opsNo)
    } else {
      newExpanded.add(opsNo)
    }
    setExpandedOps(newExpanded)
  }

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-3">
        {Array.from(groupedOrders.entries()).map(([opsNo, opsRows]) => {
          const isExpanded = expandedOps.has(opsNo)
          const firstRow = opsRows[0]
          const totalPcs = opsRows.reduce((sum, r) => sum + r.orderPcs, 0)

          return (
            <Card key={opsNo} className="overflow-hidden">
              {/* Order Header */}
              <div
                className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleOps(opsNo)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg">{opsNo}</span>
                        <Badge variant={firstRow.companyCode === 'EMPL' ? 'default' : 'secondary'}>
                          {firstRow.companyCode}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {firstRow.customerCode} • {firstRow.merchant} • {opsRows.length} items • {totalPcs} pcs
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">Ex-Factory</div>
                    <div className={cn(
                      'font-bold',
                      checkOverdue(firstRow.exFactoryDate) && 'text-red-600'
                    )}>
                      {formatDateShort(firstRow.exFactoryDate)}
                    </div>
                  </div>
                </div>
              </div>

              {/* TNA Timeline (expanded) */}
              {isExpanded && (
                <CardContent className="p-4 pt-0">
                  <TnaTimelineWrapper
                    orderId={firstRow.orderId}
                    opsNo={opsNo}
                    poDate={firstRow.poDate}
                    exFactoryDate={firstRow.exFactoryDate}
                    isMobile={isMobile}
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

// Wrapper component that fetches order data and chooses Gantt or vertical view
function TnaTimelineWrapper({
  orderId,
  opsNo,
  poDate,
  exFactoryDate,
  isMobile
}: {
  orderId: string
  opsNo: string
  poDate: string
  exFactoryDate: string
  isMobile: boolean
}) {
  const { data: orderData, isLoading } = useOrder(orderId)

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

  // Get tracker stages data
  const stages = orderData?.tracker?.stages

  // Get TNA entries from order
  const tnaEntries = orderData?.tna?.entries

  // On mobile, show vertical timeline for better usability
  if (isMobile) {
    return (
      <TnaTimelineVertical
        orderId={orderId}
        opsNo={opsNo}
        stages={stages}
        tnaEntries={tnaEntries}
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
      stages={stages}
    />
  )
}

// Vertical timeline for mobile view (original design)
function TnaTimelineVertical({
  orderId,
  opsNo,
  stages,
  tnaEntries
}: {
  orderId: string
  opsNo: string
  stages?: Record<TnaStage, { status: StageStatus; actualDate?: string | null }>
  tnaEntries?: Array<{ stage: TnaStage; targetDate: string | null }>
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
