import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TnaTracker } from '@/components/TnaTracker'
import type { OrderWithTracker, TnaStage } from '@/types'
import { TNA_STAGE_LABELS } from '@/types'
import { formatOpsNo, formatDate, daysUntil, getDaysLeftColor } from '@/lib/utils'
import { ChevronDown, ChevronRight, Package } from 'lucide-react'

interface OrdersTableProps {
  orders: OrderWithTracker[]
  isLoading: boolean
}

export function OrdersTable({ orders, isLoading }: OrdersTableProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="text-sm text-muted-foreground mt-2">Loading orders...</p>
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"></TableHead>
          <TableHead>OPS #</TableHead>
          <TableHead>Buyer</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">SQM</TableHead>
          <TableHead>Ex-Factory</TableHead>
          <TableHead>Days Left</TableHead>
          <TableHead>Current Stage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const isExpanded = expandedOrders.has(order.id)
          const currentStage = order.tracker?.currentStage || 'raw_material_purchase'
          const daysLeft = daysUntil(order.shipDate)

          return (
            <>
              <TableRow
                key={order.id}
                className="cursor-pointer"
                onClick={() => toggleOrder(order.id)}
              >
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="font-medium">
                  {formatOpsNo(order.salesNo)}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{order.customerCode}</span>
                </TableCell>
                <TableCell className="text-right">
                  {order.totalPcs.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {order.totalSqm.toFixed(1)}
                </TableCell>
                <TableCell>{formatDate(order.shipDate)}</TableCell>
                <TableCell>
                  <span className={getDaysLeftColor(daysLeft)}>
                    {daysLeft !== null ? (
                      daysLeft < 0 ? (
                        `${Math.abs(daysLeft)}d overdue`
                      ) : (
                        `${daysLeft}d`
                      )
                    ) : (
                      '-'
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={getStageVariant(currentStage)}
                    className="text-xs"
                  >
                    {TNA_STAGE_LABELS[currentStage]}
                  </Badge>
                </TableCell>
              </TableRow>

              {/* Expanded TNA Tracker */}
              {isExpanded && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0 bg-muted/30">
                    <div className="p-6">
                      <TnaTracker order={order} />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          )
        })}
      </TableBody>
    </Table>
  )
}

function getStageVariant(stage: TnaStage): 'default' | 'secondary' | 'success' | 'warning' {
  // Early stages
  if (['raw_material_purchase', 'dyeing'].includes(stage)) {
    return 'secondary'
  }
  // Middle stages
  if (['weaving', 'finishing', 'fg_godown'].includes(stage)) {
    return 'warning'
  }
  // Late stages
  if (['inspection', 'packing', 'dispatch'].includes(stage)) {
    return 'success'
  }
  return 'default'
}
