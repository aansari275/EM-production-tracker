import { useMemo, useState } from 'react'
import { useOrders } from '@/hooks/useOrders'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Download, Search, ChevronUp, ChevronDown } from 'lucide-react'
import type { OrderWithTracker } from '@/types'
import { format, parseISO } from 'date-fns'

type SortField = 'salesNo' | 'customerCode' | 'orderConfirmationDate' | 'merchantCode' | 'managedBy' | 'totalPcs' | 'totalSqm' | 'shipDate'
type SortDirection = 'asc' | 'desc'

// Format OPS number for display (e.g., OPS-25881 -> EM-25-881)
function formatOpsNo(opsNo: string): string {
  if (!opsNo) return ''
  const match = opsNo.match(/^OPS-(\d{2})(\d+)$/)
  if (match) {
    const year = match[1]
    const seq = match[2]
    return `EM-${year}-${seq}`
  }
  return opsNo
}

// Format date for display
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  try {
    return format(parseISO(dateStr), 'dd-MM-yyyy')
  } catch {
    return dateStr
  }
}

// Get unique item names from order
function getItemNames(order: OrderWithTracker): string {
  if (!order.items || order.items.length === 0) return '-'
  const names = [...new Set(order.items.map(i => i.articleName || i.sku || '-'))]
  if (names.length <= 2) {
    return names.join(', ')
  }
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

// Get label status (placeholder - can be expanded)
function getLabelStatus(_order: OrderWithTracker): string {
  // This would check if labels are approved for all items
  // For now, return a placeholder
  return 'Buyer'
}

export function OrderSummaryTab() {
  const [searchQuery, setSearchQuery] = useState('')
  const [merchantFilter, setMerchantFilter] = useState<string>('all')
  const [managedByFilter, setManagedByFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('salesNo')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Fetch orders using existing hook
  const { data: orders = [], isLoading } = useOrders()

  // Get unique merchants and directors for filters
  const { uniqueMerchants, uniqueDirectors } = useMemo(() => {
    const merchantSet = new Set<string>()
    const directorSet = new Set<string>()

    orders.forEach((order) => {
      if (order.merchantCode) merchantSet.add(order.merchantCode)
      if (order.managedBy) directorSet.add(order.managedBy)
    })

    return {
      uniqueMerchants: Array.from(merchantSet).sort(),
      uniqueDirectors: Array.from(directorSet).sort(),
    }
  }, [orders])

  // Apply filters
  const filteredOrders = useMemo(() => {
    let filtered = [...orders]

    // Merchant filter
    if (merchantFilter && merchantFilter !== 'all') {
      filtered = filtered.filter(o => o.merchantCode === merchantFilter)
    }

    // Managed By filter
    if (managedByFilter && managedByFilter !== 'all') {
      filtered = filtered.filter(o => o.managedBy === managedByFilter)
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(o =>
        o.salesNo?.toLowerCase().includes(query) ||
        formatOpsNo(o.salesNo)?.toLowerCase().includes(query) ||
        o.customerCode?.toLowerCase().includes(query) ||
        o.buyerName?.toLowerCase().includes(query) ||
        o.poNo?.toLowerCase().includes(query) ||
        o.merchantCode?.toLowerCase().includes(query) ||
        o.items?.some(i => i.articleName?.toLowerCase().includes(query))
      )
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
        case 'salesNo':
          aVal = a.salesNo || ''
          bVal = b.salesNo || ''
          break
        case 'customerCode':
          aVal = a.customerCode || ''
          bVal = b.customerCode || ''
          break
        case 'orderConfirmationDate':
          aVal = a.orderConfirmationDate || ''
          bVal = b.orderConfirmationDate || ''
          break
        case 'merchantCode':
          aVal = a.merchantCode || ''
          bVal = b.merchantCode || ''
          break
        case 'managedBy':
          aVal = a.managedBy || ''
          bVal = b.managedBy || ''
          break
        case 'totalPcs':
          aVal = a.totalPcs || 0
          bVal = b.totalPcs || 0
          break
        case 'totalSqm':
          aVal = a.totalSqm || 0
          bVal = b.totalSqm || 0
          break
        case 'shipDate':
          aVal = a.shipDate || ''
          bVal = b.shipDate || ''
          break
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      const comparison = String(aVal).localeCompare(String(bVal))
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [orders, merchantFilter, managedByFilter, searchQuery, sortField, sortDirection])

  // Calculate totals
  const totals = useMemo(() => {
    return filteredOrders.reduce((acc, order) => ({
      pcs: acc.pcs + (order.totalPcs || 0),
      sqm: acc.sqm + (order.totalSqm || 0),
    }), { pcs: 0, sqm: 0 })
  }, [filteredOrders])

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc'
      ? <ChevronUp className="h-4 w-4 inline ml-1" />
      : <ChevronDown className="h-4 w-4 inline ml-1" />
  }

  // Export to CSV
  const handleExport = () => {
    const headers = [
      'S.NO',
      'SALES NO',
      'CUSTOMER CODE',
      'ORDER CONFIRMATION DATE',
      'Labels Status',
      'Merchant Name',
      'MANAGED BY',
      'PO NUMBER',
      'Items',
      'PCS',
      'Total Sq. Meter',
      'SHIP DATE (Ex Factory)'
    ]

    const rows = filteredOrders.map((order, index) => [
      index + 1,
      formatOpsNo(order.salesNo),
      order.customerCode,
      formatDate(order.orderConfirmationDate),
      getLabelStatus(order),
      order.merchantCode || '-',
      order.managedBy || '-',
      order.poNo || '-',
      getItemNames(order),
      order.totalPcs,
      order.totalSqm.toFixed(2),
      formatDate(order.shipDate)
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `order-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <div className="space-y-4">
          <div className="h-10 w-full bg-muted animate-pulse rounded" />
          <div className="h-64 w-full bg-muted animate-pulse rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border">
      {/* Header with filters */}
      <div className="p-4 border-b">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search OPS, buyer, PO, article..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Merchant Filter */}
          <Select value={merchantFilter} onValueChange={setMerchantFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Merchant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Merchants</SelectItem>
              {uniqueMerchants.map(code => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Managed By Filter */}
          <Select value={managedByFilter} onValueChange={setManagedByFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Managed By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directors</SelectItem>
              {uniqueDirectors.map(name => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Export Button */}
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">{filteredOrders.length}</span> Open OPS
          </div>
          <div>
            <span className="font-medium text-foreground">{totals.pcs.toLocaleString()}</span> Total Pcs
          </div>
          <div>
            <span className="font-medium text-foreground">{totals.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> Total SQM
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-yellow-100 dark:bg-yellow-900/30">
              <TableHead className="w-[60px] font-bold text-foreground">S.NO</TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30"
                onClick={() => handleSort('salesNo')}
              >
                SALES NO <SortIcon field="salesNo" />
              </TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30"
                onClick={() => handleSort('customerCode')}
              >
                CUSTOMER CODE <SortIcon field="customerCode" />
              </TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30"
                onClick={() => handleSort('orderConfirmationDate')}
              >
                ORDER CONFIRMATION DATE <SortIcon field="orderConfirmationDate" />
              </TableHead>
              <TableHead className="font-bold text-foreground">Labels Status</TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30"
                onClick={() => handleSort('merchantCode')}
              >
                Merchant Name <SortIcon field="merchantCode" />
              </TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30"
                onClick={() => handleSort('managedBy')}
              >
                MANAGED BY <SortIcon field="managedBy" />
              </TableHead>
              <TableHead className="font-bold text-foreground">PO NUMBER</TableHead>
              <TableHead className="font-bold text-foreground">Items</TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30 text-right"
                onClick={() => handleSort('totalPcs')}
              >
                PCS <SortIcon field="totalPcs" />
              </TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30 text-right"
                onClick={() => handleSort('totalSqm')}
              >
                Total Sq. Meter <SortIcon field="totalSqm" />
              </TableHead>
              <TableHead
                className="cursor-pointer font-bold text-foreground hover:bg-yellow-200 dark:hover:bg-yellow-800/30"
                onClick={() => handleSort('shipDate')}
              >
                SHIP DATE (Ex Factory) <SortIcon field="shipDate" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                  No open orders found
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order, index) => (
                <TableRow key={order.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatOpsNo(order.salesNo)}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{order.customerCode}</span>
                  </TableCell>
                  <TableCell>{formatDate(order.orderConfirmationDate)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700">
                      {getLabelStatus(order)}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.merchantCode || '-'}</TableCell>
                  <TableCell>{order.managedBy || '-'}</TableCell>
                  <TableCell className="max-w-[150px] truncate" title={order.poNo}>
                    {order.poNo || '-'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={getItemNames(order)}>
                    {getItemNames(order)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {order.totalPcs.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {order.totalSqm.toFixed(2)}
                  </TableCell>
                  <TableCell>{formatDate(order.shipDate)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer with totals */}
      {filteredOrders.length > 0 && (
        <div className="p-4 border-t bg-muted/30">
          <div className="flex justify-end gap-8 text-sm">
            <div>
              <span className="text-muted-foreground">Total PCS:</span>{' '}
              <span className="font-bold">{totals.pcs.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total SQM:</span>{' '}
              <span className="font-bold">{totals.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
