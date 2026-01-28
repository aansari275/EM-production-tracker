import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import type { ProductionRow, TnaStage, StageStatus } from '@/types'
import { TNA_STAGES, TNA_STAGE_LABELS } from '@/types'
import { formatDateShort, cn } from '@/lib/utils'
import { useUpdateStage } from '@/hooks/useProductionTracker'
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

export function TnaView({ rows, isLoading }: TnaViewProps) {
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())

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
                      isOverdue(firstRow.exFactoryDate) && 'text-red-600'
                    )}>
                      {formatDateShort(firstRow.exFactoryDate)}
                    </div>
                  </div>
                </div>
              </div>

              {/* TNA Timeline (expanded) */}
              {isExpanded && (
                <CardContent className="p-4 pt-0">
                  <TnaTimeline orderId={firstRow.orderId} opsNo={opsNo} />
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </ScrollArea>
  )
}

// TNA Timeline component for a single order
function TnaTimeline({ orderId, opsNo }: { orderId: string; opsNo: string }) {
  const updateStage = useUpdateStage()

  // For now, show all stages with pending status
  // In real implementation, this would fetch from production_tracker collection
  const stages = TNA_STAGES.map(stage => ({
    stage,
    label: TNA_STAGE_LABELS[stage],
    status: 'pending' as StageStatus,
    targetDate: null as string | null,
    actualDate: null as string | null,
    notes: ''
  }))

  const handleStatusChange = async (stage: TnaStage, newStatus: StageStatus) => {
    try {
      await updateStage.mutateAsync({
        orderId,
        opsNo,
        stage,
        update: {
          status: newStatus,
          actualDate: newStatus === 'completed' ? new Date().toISOString().split('T')[0] : null
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
          {stages.map((stageData, index) => (
            <div key={stageData.stage} className="relative flex items-start gap-4 pl-10">
              {/* Status indicator */}
              <div
                className={cn(
                  'absolute left-2 w-5 h-5 rounded-full flex items-center justify-center',
                  'border-2 bg-white cursor-pointer transition-colors',
                  stageData.status === 'completed' && 'bg-green-500 border-green-500',
                  stageData.status === 'in_progress' && 'bg-amber-500 border-amber-500',
                  stageData.status === 'pending' && 'border-gray-300 hover:border-gray-400'
                )}
                onClick={() => {
                  // Cycle through statuses: pending -> in_progress -> completed -> pending
                  const nextStatus: StageStatus =
                    stageData.status === 'pending' ? 'in_progress' :
                    stageData.status === 'in_progress' ? 'completed' : 'pending'
                  handleStatusChange(stageData.stage, nextStatus)
                }}
              >
                {stageData.status === 'completed' && (
                  <Check className="h-3 w-3 text-white" />
                )}
                {stageData.status === 'in_progress' && (
                  <Clock className="h-3 w-3 text-white" />
                )}
                {stageData.status === 'pending' && (
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
                      stageData.status === 'completed' && 'text-green-700',
                      stageData.status === 'in_progress' && 'text-amber-700',
                      stageData.status === 'pending' && 'text-gray-600'
                    )}>
                      {stageData.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    {stageData.targetDate && (
                      <div className="text-muted-foreground">
                        Target: {formatDateShort(stageData.targetDate)}
                      </div>
                    )}
                    {stageData.actualDate && (
                      <div className="text-green-600 font-medium">
                        Done: {formatDateShort(stageData.actualDate)}
                      </div>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        stageData.status === 'completed' && 'border-green-500 text-green-700 bg-green-50',
                        stageData.status === 'in_progress' && 'border-amber-500 text-amber-700 bg-amber-50',
                        stageData.status === 'pending' && 'border-gray-300 text-gray-500'
                      )}
                    >
                      {stageData.status === 'completed' ? 'Done' :
                       stageData.status === 'in_progress' ? 'In Progress' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Helper to check if date is overdue
function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false
  try {
    const date = new Date(dateStr)
    return date < new Date()
  } catch {
    return false
  }
}
