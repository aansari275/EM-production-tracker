import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DashboardStats } from '@/types'
import { Package, Layers, Hash, AlertTriangle, Calendar, Building2 } from 'lucide-react'

interface StatsCardsProps {
  stats: DashboardStats | undefined
  isLoading: boolean
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-3">
              <div className="h-6 bg-muted rounded w-12 mb-1" />
              <div className="h-3 bg-muted rounded w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const statItems = [
    {
      label: 'Open Orders',
      value: stats?.totalOrders || 0,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Total Items',
      value: stats?.totalItems || 0,
      icon: Layers,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      label: 'Total Pcs',
      value: (stats?.totalPcs || 0).toLocaleString(),
      icon: Hash,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
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
    {
      label: 'EMPL / EHI',
      value: `${stats?.byCompany?.EMPL || 0} / ${stats?.byCompany?.EHI || 0}`,
      icon: Building2,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      {statItems.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
              <div className={`p-1.5 rounded-lg ${item.bgColor}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
