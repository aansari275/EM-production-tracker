import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateStage } from '@/hooks/useProductionTracker'
import type { OrderWithTracker, TnaStage, StageStatus, StageUpdate } from '@/types'
import { TNA_STAGES, TNA_STAGE_LABELS, TNA_OPTIONAL_STAGES } from '@/types'
import { formatDate, getStageStatusBg, cn } from '@/lib/utils'
import { Check, Clock, Circle, Save, Loader2 } from 'lucide-react'

interface TnaTrackerProps {
  order: OrderWithTracker
}

export function TnaTracker({ order }: TnaTrackerProps) {
  const updateStage = useUpdateStage()
  const [editingStage, setEditingStage] = useState<TnaStage | null>(null)
  const [editForm, setEditForm] = useState<{
    status: StageStatus
    actualDate: string
    notes: string
  }>({ status: 'pending', actualDate: '', notes: '' })

  const handleEditStage = (stage: TnaStage) => {
    const stageData = order.tracker?.stages[stage]
    setEditForm({
      status: stageData?.status || 'pending',
      actualDate: stageData?.actualDate || '',
      notes: stageData?.notes || '',
    })
    setEditingStage(stage)
  }

  const handleSaveStage = async () => {
    if (!editingStage) return

    await updateStage.mutateAsync({
      orderId: order.id,
      opsNo: order.salesNo,
      stage: editingStage,
      update: {
        status: editForm.status,
        actualDate: editForm.actualDate || null,
        notes: editForm.notes || undefined,
      },
    })

    setEditingStage(null)
  }

  const handleCancelEdit = () => {
    setEditingStage(null)
  }

  return (
    <div className="space-y-4">
      {/* Order Info Header */}
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Buyer:</span>{' '}
          <span className="font-medium">{order.buyerName}</span>
        </div>
        <div>
          <span className="text-muted-foreground">PO:</span>{' '}
          <span className="font-medium">{order.poNo}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Merchant:</span>{' '}
          <span className="font-medium">{order.merchantCode}</span>
        </div>
      </div>

      {/* TNA Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-border" />

        <div className="space-y-3">
          {TNA_STAGES.map((stage, index) => {
            const tnaEntry = order.tna?.entries.find((e) => e.stage === stage)
            const stageData = order.tracker?.stages[stage]
            const isOptional = TNA_OPTIONAL_STAGES.includes(stage)
            const isNa = isOptional && tnaEntry?.targetDate === null
            const isEditing = editingStage === stage

            // Skip N/A stages
            if (isNa) return null

            const status = stageData?.status || 'pending'

            return (
              <div
                key={stage}
                className={cn(
                  'flex items-start gap-4 p-3 rounded-lg transition-colors',
                  isEditing ? 'bg-muted' : 'hover:bg-muted/50'
                )}
              >
                {/* Status Circle */}
                <div
                  className={cn(
                    'relative z-10 flex items-center justify-center w-8 h-8 rounded-full shrink-0',
                    status === 'completed' && 'bg-green-500 text-white',
                    status === 'in_progress' && 'bg-amber-500 text-white animate-pulse-amber',
                    status === 'pending' && 'bg-gray-200 text-gray-600'
                  )}
                >
                  {status === 'completed' ? (
                    <Check className="h-4 w-4" />
                  ) : status === 'in_progress' ? (
                    <Clock className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </div>

                {/* Stage Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {TNA_STAGE_LABELS[stage]}
                    </span>
                    {isOptional && (
                      <Badge variant="outline" className="text-xs">
                        Optional
                      </Badge>
                    )}
                  </div>

                  {isEditing ? (
                    /* Edit Form */
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Status</Label>
                          <Select
                            value={editForm.status}
                            onValueChange={(value: StageStatus) =>
                              setEditForm({ ...editForm, status: value })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Actual Date</Label>
                          <Input
                            type="date"
                            value={editForm.actualDate}
                            onChange={(e) =>
                              setEditForm({ ...editForm, actualDate: e.target.value })
                            }
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notes</Label>
                        <Textarea
                          value={editForm.notes}
                          onChange={(e) =>
                            setEditForm({ ...editForm, notes: e.target.value })
                          }
                          placeholder="Optional notes..."
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveStage}
                          disabled={updateStage.isPending}
                        >
                          {updateStage.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Save className="h-4 w-4 mr-1" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Display View */
                    <div
                      className="mt-1 flex items-center gap-4 text-sm text-muted-foreground cursor-pointer"
                      onClick={() => handleEditStage(stage)}
                    >
                      <div>
                        <span className="text-xs">Target:</span>{' '}
                        {formatDate(tnaEntry?.targetDate)}
                      </div>
                      {stageData?.actualDate && (
                        <div>
                          <span className="text-xs">Actual:</span>{' '}
                          <span className="text-foreground">
                            {formatDate(stageData.actualDate)}
                          </span>
                        </div>
                      )}
                      {stageData?.notes && (
                        <div className="text-xs italic truncate max-w-[200px]">
                          "{stageData.notes}"
                        </div>
                      )}
                      <span className="text-xs text-primary ml-auto">
                        Click to edit
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
