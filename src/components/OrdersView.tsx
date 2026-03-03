import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import type { OrderWithTracker } from '@/types'
import { formatOpsNo, formatDateShort, isOverdue, cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  Package,
  Loader2,
} from 'lucide-react'

interface OrdersViewProps {
  orders: OrderWithTracker[]
  isLoading: boolean
}

export function OrdersView({ orders, isLoading }: OrdersViewProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  // Sort by Ex-Factory date (nearest first)
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const dateA = new Date(a.shipDate || '9999-12-31')
      const dateB = new Date(b.shipDate || '9999-12-31')
      return dateA.getTime() - dateB.getTime()
    })
  }, [orders])

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Loading orders...</p>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="p-12 text-center">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">No orders found</p>
        <p className="text-sm text-muted-foreground">
          No open orders match your filters
        </p>
      </div>
    )
  }

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

  return (
    <div className="divide-y">
      {sortedOrders.map((order) => {
        const isExpanded = expandedOrders.has(order.id)
        const opsNo = formatOpsNo(order.salesNo)
        const overdue = isOverdue(order.shipDate)
        const totalSqm = order.totalSqm || order.items?.reduce((sum, i) => sum + (i.sqm || 0), 0) || 0
        const totalPcs = order.totalPcs || order.items?.reduce((sum, i) => sum + (i.pcs || 0), 0) || 0

        return (
          <div key={order.id}>
            {/* Order Row */}
            <div
              className={cn(
                'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                'hover:bg-gray-50',
                isExpanded && 'bg-gray-50'
              )}
              onClick={() => toggleOrder(order.id)}
            >
              {/* Expand icon */}
              <div className="flex-shrink-0 text-gray-400">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>

              {/* OPS # */}
              <div className="w-28 flex-shrink-0">
                <span className="font-mono font-semibold text-sm">{opsNo}</span>
              </div>

              {/* Company Badge */}
              <div className="w-14 flex-shrink-0">
                <Badge
                  variant={order.companyCode === 'EMPL' ? 'default' : 'secondary'}
                  className="text-[10px] px-1.5 py-0"
                >
                  {order.companyCode}
                </Badge>
              </div>

              {/* Buyer */}
              <div className="w-16 flex-shrink-0">
                <span className="text-sm font-medium text-gray-700">{order.customerCode}</span>
              </div>

              {/* Items count */}
              <div className="w-16 flex-shrink-0 text-center">
                <span className="text-sm text-gray-500">
                  {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Total Pcs */}
              <div className="w-20 flex-shrink-0 text-right">
                <span className="text-sm font-medium">{totalPcs.toLocaleString()} pcs</span>
              </div>

              {/* Total SQM */}
              <div className="w-20 flex-shrink-0 text-right hidden sm:block">
                <span className="text-sm text-gray-500">{totalSqm.toFixed(1)} sqm</span>
              </div>

              {/* Ex-Factory */}
              <div className="ml-auto flex-shrink-0 text-right">
                <span
                  className={cn(
                    'text-sm font-medium',
                    overdue ? 'text-red-600' : 'text-gray-700'
                  )}
                >
                  {formatDateShort(order.shipDate)}
                </span>
              </div>
            </div>

            {/* Expanded Items Table */}
            {isExpanded && (
              <div className="bg-gray-50 border-t px-4 py-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left py-2 pr-4 font-medium">Article</th>
                        <th className="text-left py-2 pr-4 font-medium">Size</th>
                        <th className="text-left py-2 pr-4 font-medium">Color</th>
                        <th className="text-left py-2 pr-4 font-medium">Quality</th>
                        <th className="text-right py-2 pr-4 font-medium">Pcs</th>
                        <th className="text-right py-2 font-medium">SQM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {order.items?.map((item) => (
                        <tr key={item.id} className="text-gray-700">
                          <td className="py-2 pr-4 font-medium">
                            {item.emDesignName || item.articleName || '-'}
                          </td>
                          <td className="py-2 pr-4">{item.size || '-'}</td>
                          <td className="py-2 pr-4">{item.color || '-'}</td>
                          <td className="py-2 pr-4">{item.quality || '-'}</td>
                          <td className="py-2 pr-4 text-right font-medium">{item.pcs}</td>
                          <td className="py-2 text-right">{item.sqm?.toFixed(1) || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {(order.items?.length || 0) > 1 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                          <td className="py-2 pr-4" colSpan={4}>Total</td>
                          <td className="py-2 pr-4 text-right">{totalPcs.toLocaleString()}</td>
                          <td className="py-2 text-right">{totalSqm.toFixed(1)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Order metadata */}
                <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                  <span>Buyer: {order.buyerName}</span>
                  <span>PO: {order.poNo}</span>
                  {order.shipDate && (
                    <span>
                      Ship Date: {formatDateShort(order.buyerPoShipDate || order.shipDate)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
