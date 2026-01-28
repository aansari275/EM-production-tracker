import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DashboardStats, TNA_STAGE_SHORT_LABELS, TnaStage } from '@/types'
import { TNA_STAGES } from '@/types'
import { Package, Clock, AlertTriangle, Calendar } from 'lucide-react'

interface StatsCardsProps {
  stats: DashboardStats | undefined
  isLoading: boolean
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-8 bg-muted rounded w-16 mb-2" />
              <div className="h-4 bg-muted rounded w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const statItems = [
    {
      label: 'Open Orders',
      value: stats?.totalOpen || 0,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'In Weaving',
      value: stats?.byStage?.weaving || 0,
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Overdue',
      value: stats?.overdue || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      label: 'This Week',
      value: stats?.thisWeek || 0,
      icon: Calendar,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statItems.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-bold">{item.value}</p>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                </div>
                <div className={`p-2 rounded-lg ${item.bgColor}`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stage Breakdown */}
      {stats?.byStage && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Orders by Stage</p>
            <div className="flex flex-wrap gap-2">
              {TNA_STAGES.map((stage) => {
                const count = stats.byStage[stage] || 0
                if (count === 0) return null
                return (
                  <Badge
                    key={stage}
                    variant="secondary"
                    className="text-xs"
                  >
                    {getStageShortLabel(stage)}: {count}
                  </Badge>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function getStageShortLabel(stage: TnaStage): string {
  const labels: Record<TnaStage, string> = {
    raw_material_purchase: 'Raw Mat.',
    dyeing: 'Dyeing',
    photo_shoot_approval: 'Photo',
    first_piece_approval: 'First Pc',
    weaving: 'Weaving',
    finishing: 'Finishing',
    fg_godown: 'FG',
    order_label_in_house: 'Labels',
    inspection: 'Insp.',
    packing: 'Packing',
    dispatch: 'Dispatch',
  }
  return labels[stage] || stage
}
