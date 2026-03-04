import { useState, useMemo, Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { OrderWithTracker, OrderItem, ProductionStatsMap } from '@/types'
import { formatOpsNo, formatDateShort, formatDate, daysUntil, cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  Package,
  Loader2,
} from 'lucide-react'

// ============== DaysLeftBadge ==============

function DaysLeftBadge({ shipDate }: { shipDate: string | null | undefined }) {
  const days = daysUntil(shipDate)

  if (!shipDate) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
        No Date
      </span>
    )
  }

  if (days === null) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
        Invalid Date
      </span>
    )
  }

  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
        {Math.abs(days)}d overdue
      </span>
    )
  }

  if (days === 0) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">
        Today
      </span>
    )
  }

  if (days <= 7) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">
        {days}d left
      </span>
    )
  }

  if (days <= 30) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
        {days}d left
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
      {days}d left
    </span>
  )
}

// ============== Expanded Order Details ==============

function ExpandedOrderDetails({ order }: { order: OrderWithTracker }) {
  const [showAllItems, setShowAllItems] = useState(false)

  const totalPcs = order.totalPcs || order.items?.reduce((sum, i) => sum + (i.pcs || 0), 0) || 0
  const totalSqm = order.totalSqm || order.items?.reduce((sum, i) => sum + (i.sqm || 0), 0) || 0
  const itemCount = order.items?.length || 0

  const visibleItems = showAllItems ? order.items : order.items?.slice(0, 10)
  const hiddenCount = itemCount > 10 ? itemCount - 10 : 0

  return (
    <div className="bg-gray-50 px-4 py-4 space-y-4">
      {/* Key Info Bar */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-gray-500">PO No:</span>{' '}
          <span className="font-medium">{order.poNo || '-'}</span>
        </div>
        <div>
          <span className="text-gray-500">PO Rec'd:</span>{' '}
          <span className="font-medium">{formatDate(order.orderConfirmationDate)}</span>
        </div>
        <div>
          <span className="text-gray-500">Buyer Ship:</span>{' '}
          <span className="font-medium">{formatDate(order.buyerPoShipDate)}</span>
        </div>
        <div>
          <span className="text-gray-500">Company:</span>{' '}
          <Badge
            variant={order.companyCode === 'EMPL' ? 'default' : 'secondary'}
            className="text-[10px] px-1.5 py-0 ml-1"
          >
            {order.companyCode}
          </Badge>
        </div>
        <div>
          <span className="text-gray-500">Merchant:</span>{' '}
          <span className="font-medium">
            {order.merchantCode || '-'}
            {order.assistantMerchantCode ? ` + ${order.assistantMerchantCode}` : ''}
          </span>
        </div>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border p-3 text-center">
          <div className="text-lg font-semibold">{totalPcs.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Total Pcs</div>
        </div>
        <div className="bg-white rounded-lg border p-3 text-center">
          <div className="text-lg font-semibold">{totalSqm.toFixed(1)}</div>
          <div className="text-xs text-gray-500">Total SQM</div>
        </div>
        <div className="bg-white rounded-lg border p-3 text-center">
          <div className="text-lg font-semibold">{itemCount}</div>
          <div className="text-xs text-gray-500">Items</div>
        </div>
        <div className="bg-white rounded-lg border p-3 text-center">
          <div className="text-lg font-semibold truncate">{order.customerCode}</div>
          <div className="text-xs text-gray-500 truncate">{order.buyerName || 'Buyer'}</div>
        </div>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b">
              <th className="text-left py-2 pr-4 font-medium">EM Design</th>
              <th className="text-left py-2 pr-4 font-medium">Article / SKU</th>
              <th className="text-left py-2 pr-4 font-medium">Size</th>
              <th className="text-right py-2 pr-4 font-medium">Pcs</th>
              <th className="text-right py-2 font-medium">SQM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {visibleItems?.map((item: OrderItem) => (
              <tr key={item.id} className="text-gray-700">
                <td className="py-2 pr-4 font-medium">{item.emDesignName || '-'}</td>
                <td className="py-2 pr-4 text-gray-500">{item.articleName || item.sku || '-'}</td>
                <td className="py-2 pr-4">{item.size || '-'}</td>
                <td className="py-2 pr-4 text-right font-medium">{item.pcs}</td>
                <td className="py-2 text-right">{item.sqm?.toFixed(1) || '-'}</td>
              </tr>
            ))}
          </tbody>
          {itemCount > 1 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                <td className="py-2 pr-4" colSpan={3}>Total</td>
                <td className="py-2 pr-4 text-right">{totalPcs.toLocaleString()}</td>
                <td className="py-2 text-right">{totalSqm.toFixed(1)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Show more toggle */}
      {hiddenCount > 0 && !showAllItems && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowAllItems(true)
          }}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Show {hiddenCount} more items
        </button>
      )}
      {showAllItems && hiddenCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowAllItems(false)
          }}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Show less
        </button>
      )}
    </div>
  )
}

// ============== Main OrdersView ==============

interface OrdersViewProps {
  orders: OrderWithTracker[]
  isLoading: boolean
  productionStats?: ProductionStatsMap
}

export function OrdersView({ orders, isLoading, productionStats }: OrdersViewProps) {
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
    <div>
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-[40px]"></TableHead>
            <TableHead className="w-[90px]">OPS #</TableHead>
            <TableHead className="w-[80px]">Buyer</TableHead>
            <TableHead className="w-[80px] hidden sm:table-cell">Merchant</TableHead>
            <TableHead className="w-[60px] hidden sm:table-cell">Type</TableHead>
            <TableHead className="w-[70px] text-right">Qty</TableHead>
            <TableHead className="w-[60px] text-right hidden md:table-cell">Bazar</TableHead>
            <TableHead className="w-[60px] text-right hidden md:table-cell">Bal</TableHead>
            <TableHead className="w-[70px] text-right hidden sm:table-cell">SQM</TableHead>
            <TableHead className="w-[100px] hidden sm:table-cell">Ex Factory</TableHead>
            <TableHead className="w-[90px] text-center">Days Left</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOrders.map((order) => {
            const isExpanded = expandedOrders.has(order.id)
            const opsNo = formatOpsNo(order.salesNo)
            const totalPcs = order.totalPcs || order.items?.reduce((sum, i) => sum + (i.pcs || 0), 0) || 0
            const totalSqm = order.totalSqm || order.items?.reduce((sum, i) => sum + (i.sqm || 0), 0) || 0

            // Production stats lookup
            const stats = productionStats?.[formatOpsNo(order.salesNo)]
            const bazarPct = stats && stats.pcs > 0 ? Math.round((stats.bazar / stats.pcs) * 100) : null
            const bal = stats ? stats.bal : null

            return (
              <Fragment key={order.id}>
                <TableRow
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-gray-50',
                    isExpanded && 'bg-gray-50 border-b-0'
                  )}
                  onClick={() => toggleOrder(order.id)}
                >
                  <TableCell className="py-2 pr-0">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </TableCell>
                  <TableCell className="py-2 font-medium font-mono text-sm">
                    {opsNo}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="font-mono text-sm text-blue-600">{order.customerCode}</span>
                  </TableCell>
                  <TableCell className="py-2 text-sm text-gray-600 hidden sm:table-cell">
                    {order.merchantCode || '-'}
                  </TableCell>
                  <TableCell className="py-2 hidden sm:table-cell">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      order.orderType === 'custom' && 'bg-purple-100 text-purple-700',
                      order.orderType === 'broadloom' && 'bg-blue-100 text-blue-700',
                      order.orderType === 'area_rugs' && 'bg-green-100 text-green-700',
                      order.orderType === 'samples' && 'bg-amber-100 text-amber-700',
                      !order.orderType && 'bg-gray-100 text-gray-600'
                    )}>
                      {order.orderType === 'area_rugs' ? 'Area Rugs' :
                       order.orderType === 'custom' ? 'Custom' :
                       order.orderType === 'broadloom' ? 'Broadloom' :
                       order.orderType === 'samples' ? 'Samples' :
                       order.orderType || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    {totalPcs.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right hidden md:table-cell">
                    {bazarPct !== null ? (
                      <span className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        bazarPct >= 90 ? 'bg-green-100 text-green-700' :
                        bazarPct >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      )}>
                        {bazarPct}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right hidden md:table-cell">
                    {bal !== null && bal > 0 ? (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700">
                        {bal.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{bal === 0 ? '\u2014' : '-'}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm hidden sm:table-cell">
                    {totalSqm.toFixed(1)}
                  </TableCell>
                  <TableCell className="py-2 text-sm hidden sm:table-cell">
                    {formatDateShort(order.shipDate)}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <DaysLeftBadge shipDate={order.shipDate} />
                  </TableCell>
                </TableRow>

                {/* Expanded details as full-width row */}
                {isExpanded && (
                  <tr>
                    <td colSpan={11} className="p-0 border-b">
                      <ExpandedOrderDetails order={order} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
