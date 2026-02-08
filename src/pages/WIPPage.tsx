import { useState, useEffect, useRef, useMemo } from 'react'
import { useWIP } from '@/hooks/useWIP'
import type { WIPRow, WIPSummary, WIPSyncStatus } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Search,
  RefreshCw,
  Filter,
  X,
  Building2,
  User,
  ChevronDown,
  ChevronRight,
  Download,
  Wifi,
  WifiOff,
  Clock,
  Activity,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ============================================================================
// Summary Cards
// ============================================================================

function SummaryCards({ summary }: { summary: WIPSummary }) {
  const cards = [
    { label: 'Orders', value: summary.totalOrders, color: 'blue', sub: `EMPL ${summary.byCompany.EMPL.orders} / EHI ${summary.byCompany.EHI.orders}` },
    { label: 'Total Pcs', value: summary.totalPcs, color: 'purple', sub: `EMPL ${summary.byCompany.EMPL.pcs.toLocaleString()} / EHI ${summary.byCompany.EHI.pcs.toLocaleString()}` },
    { label: 'On Loom', value: summary.onLoom, color: 'amber' },
    { label: 'Bazar', value: summary.inBazar, color: 'green' },
    { label: 'Finishing', value: summary.inFinishing, color: 'orange' },
    { label: 'Packed', value: summary.packed, color: 'teal' },
  ]

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-lg border p-3 text-center"
        >
          <p className={`text-xl font-bold text-${card.color}-600`}>
            {card.value > 1000 ? `${(card.value / 1000).toFixed(1)}k` : card.value}
          </p>
          <p className="text-xs text-gray-500">{card.label}</p>
          {card.sub && (
            <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Sync Status Indicator
// ============================================================================

function SyncStatusBadge({ syncStatus }: { syncStatus: WIPSyncStatus }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <TooltipProvider>
        {/* EMPL Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
              <Wifi className="h-3 w-3" />
              EMPL Live
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>EMPL data is live from PostgreSQL</p>
          </TooltipContent>
        </Tooltip>

        {/* EHI Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`gap-1 ${
                syncStatus.ehi.status === 'synced'
                  ? 'text-green-600 border-green-200 bg-green-50'
                  : syncStatus.ehi.status === 'stale'
                  ? 'text-amber-600 border-amber-200 bg-amber-50'
                  : 'text-red-600 border-red-200 bg-red-50'
              }`}
            >
              {syncStatus.ehi.status === 'synced' ? (
                <Wifi className="h-3 w-3" />
              ) : syncStatus.ehi.status === 'stale' ? (
                <Clock className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              EHI {syncStatus.ehi.status === 'synced' ? 'Synced' : syncStatus.ehi.status === 'stale' ? 'Stale' : 'N/A'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {syncStatus.ehi.lastSyncedAt ? (
              <p>Last synced: {formatDistanceToNow(new Date(syncStatus.ehi.lastSyncedAt), { addSuffix: true })}</p>
            ) : (
              <p>EHI database not connected. Set EHI_DATABASE_URL.</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

// ============================================================================
// Company Badge
// ============================================================================

function CompanyBadge({ company }: { company: 'EMPL' | 'EHI' }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded ${
        company === 'EMPL'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-purple-100 text-purple-700'
      }`}
    >
      {company}
    </span>
  )
}

// ============================================================================
// Stage Progress Bar
// ============================================================================

function StageBar({ row }: { row: WIPRow }) {
  const total = row.totalPcs || 1
  const segments = [
    { label: 'Loom', count: row.onLoom, color: 'bg-amber-400' },
    { label: 'Bazar', count: row.bazarPcs, color: 'bg-green-400' },
    { label: 'Finish', count: row.finishingPcs, color: 'bg-orange-400' },
    { label: 'FG', count: row.fgGodownPcs, color: 'bg-blue-400' },
    { label: 'Pack', count: row.packedPcs, color: 'bg-teal-400' },
    { label: 'Ship', count: row.dispatchedPcs, color: 'bg-gray-400' },
  ]

  const totalTracked = segments.reduce((sum, s) => sum + s.count, 0)
  const untracked = Math.max(0, total - totalTracked)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {segments.map((seg) =>
              seg.count > 0 ? (
                <div
                  key={seg.label}
                  className={`${seg.color} h-full transition-all`}
                  style={{ width: `${(seg.count / total) * 100}%` }}
                />
              ) : null
            )}
            {untracked > 0 && (
              <div
                className="bg-gray-200 h-full"
                style={{ width: `${(untracked / total) * 100}%` }}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {segments.map((seg) => (
              <div key={seg.label} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${seg.color}`} />
                <span>{seg.label}: {seg.count}</span>
              </div>
            ))}
            <div className="col-span-2 border-t mt-1 pt-1 font-medium">
              Total: {totalTracked} / {total} tracked
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ============================================================================
// Expandable Row Detail
// ============================================================================

function RowDetail({ row }: { row: WIPRow }) {
  const stages = [
    { label: 'On Loom', count: row.onLoom, color: 'amber' },
    { label: 'Bazar', count: row.bazarPcs, color: 'green' },
    { label: 'Finishing', count: row.finishingPcs, color: 'orange' },
    { label: 'FG Godown', count: row.fgGodownPcs, color: 'blue' },
    { label: 'Packed', count: row.packedPcs, color: 'teal' },
    { label: 'Dispatched', count: row.dispatchedPcs, color: 'gray' },
  ]

  return (
    <tr className="bg-gray-50">
      <td colSpan={13} className="px-4 py-3">
        <div className="flex flex-wrap gap-4">
          {stages.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full bg-${s.color}-400`} />
              <span className="text-xs text-gray-600">{s.label}:</span>
              <span className={`text-sm font-bold ${s.count > 0 ? `text-${s.color}-700` : 'text-gray-300'}`}>
                {s.count}
              </span>
            </div>
          ))}
          <div className="text-xs text-gray-400 ml-auto">
            {row.folioNo && `Folio: ${row.folioNo}`}
            {row.contractor && ` | Contractor: ${row.contractor}`}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ============================================================================
// WIP Table
// ============================================================================

type SortKey = 'opsNo' | 'buyerCode' | 'design' | 'totalPcs' | 'bazarPcs' | 'packedPcs'
type SortDir = 'asc' | 'desc'

function WIPTable({ rows, isLoading }: { rows: WIPRow[]; isLoading: boolean }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('opsNo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'opsNo':
          cmp = a.opsNo.localeCompare(b.opsNo)
          break
        case 'buyerCode':
          cmp = a.buyerCode.localeCompare(b.buyerCode)
          break
        case 'design':
          cmp = a.design.localeCompare(b.design)
          break
        case 'totalPcs':
          cmp = a.totalPcs - b.totalPcs
          break
        case 'bazarPcs':
          cmp = a.bazarPcs - b.bazarPcs
          break
        case 'packedPcs':
          cmp = a.packedPcs - b.packedPcs
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const SortHeader = ({ label, field, className = '' }: { label: string; field: SortKey; className?: string }) => (
    <th
      className={`px-2 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field && (
          <span className="text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <span className="ml-3 text-gray-500">Loading WIP data from ERPs...</span>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Activity className="h-12 w-12 mb-3" />
        <p className="text-lg font-medium">No WIP data found</p>
        <p className="text-sm">Check that EMPL_DATABASE_URL and/or EHI_DATABASE_URL are configured.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b sticky top-0 z-10">
          <tr>
            <th className="w-8 px-2 py-2"></th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-12">Co.</th>
            <SortHeader label="OPS #" field="opsNo" className="w-28" />
            <SortHeader label="Buyer" field="buyerCode" className="w-16" />
            <SortHeader label="Design" field="design" className="min-w-[120px]" />
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-20">Size</th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-20">Color</th>
            <SortHeader label="Total" field="totalPcs" className="w-14 text-right" />
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-14">Loom</th>
            <SortHeader label="Bazar" field="bazarPcs" className="w-14" />
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-14">Finish</th>
            <SortHeader label="Packed" field="packedPcs" className="w-14" />
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 min-w-[120px]">Progress</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => {
            const rowKey = `${row.company}-${row.opsNo}-${row.orderItemId || idx}`
            const isExpanded = expandedRows.has(rowKey)
            const prevRow = idx > 0 ? sortedRows[idx - 1] : null
            const showBorder = prevRow && prevRow.opsNo !== row.opsNo

            return (
              <>
                <tr
                  key={rowKey}
                  className={`hover:bg-green-50/50 cursor-pointer transition-colors ${
                    showBorder ? 'border-t-2 border-gray-300' : 'border-t border-gray-100'
                  }`}
                  onClick={() => toggleRow(rowKey)}
                >
                  <td className="px-2 py-2 text-gray-400">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <CompanyBadge company={row.company} />
                  </td>
                  <td className="px-2 py-2 font-mono text-xs font-bold text-gray-800">
                    {row.opsNo}
                  </td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-700">
                    {row.buyerCode}
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-600 max-w-[180px] truncate" title={row.design}>
                    {row.design}
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-500">{row.size}</td>
                  <td className="px-2 py-2 text-xs text-gray-500 max-w-[100px] truncate" title={row.color}>
                    {row.color}
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-gray-800 text-right">
                    {row.totalPcs}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-xs font-bold ${row.onLoom > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                      {row.onLoom || '-'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-xs font-bold ${row.bazarPcs > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                      {row.bazarPcs || '-'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-xs font-bold ${row.finishingPcs > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                      {row.finishingPcs || '-'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-xs font-bold ${row.packedPcs > 0 ? 'text-teal-600' : 'text-gray-300'}`}>
                      {row.packedPcs || '-'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <StageBar row={row} />
                  </td>
                </tr>
                {isExpanded && <RowDetail key={`${rowKey}-detail`} row={row} />}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Export to Excel
// ============================================================================

function exportToExcel(rows: WIPRow[]) {
  // Simple CSV export
  const headers = ['Company', 'OPS #', 'Buyer', 'Design', 'Size', 'Color', 'Quality', 'Total', 'On Loom', 'Bazar', 'Finishing', 'FG Godown', 'Packed', 'Dispatched', 'Folio', 'Contractor']
  const csvRows = rows.map((r) => [
    r.company, r.opsNo, r.buyerCode, r.design, r.size, r.color, r.quality,
    r.totalPcs, r.onLoom, r.bazarPcs, r.finishingPcs, r.fgGodownPcs, r.packedPcs, r.dispatchedPcs,
    r.folioNo, r.contractor,
  ].map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','))

  const csv = [headers.join(','), ...csvRows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `WIP_Report_${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================================
// Main WIP Page
// ============================================================================

export function WIPPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()
  const [companyFilter, setCompanyFilter] = useState<'all' | 'EMPL' | 'EHI'>('all')
  const [buyerFilter, setBuyerFilter] = useState('')

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const { data, isLoading, isFetching } = useWIP({
    company: companyFilter,
    buyer: buyerFilter || undefined,
    search: debouncedSearch || undefined,
  })

  const rows = data?.data || []
  const summary = data?.summary
  const syncStatus = data?.syncStatus

  // Extract unique buyers for filter
  const buyers = useMemo(() => {
    const buyerSet = new Set<string>()
    rows.forEach((r) => {
      if (r.buyerCode) buyerSet.add(r.buyerCode)
    })
    return Array.from(buyerSet).sort()
  }, [rows])

  const activeFilterCount =
    (companyFilter !== 'all' ? 1 : 0) +
    (buyerFilter ? 1 : 0)

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wip'] })
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Filters Bar */}
      <div className="bg-white rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search OPS, Buyer, Design..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9 bg-gray-50 border-gray-200"
            />
          </div>

          {/* Company Filter */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            {(['all', 'EMPL', 'EHI'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCompanyFilter(c)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  companyFilter === c
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>

          {/* Buyer Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={buyerFilter ? 'default' : 'outline'}
                size="sm"
                className={`h-9 text-xs ${buyerFilter ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
                <User className="h-3 w-3 mr-1" />
                {buyerFilter || 'Buyer'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 max-h-64 overflow-y-auto">
              <DropdownMenuCheckboxItem
                checked={!buyerFilter}
                onCheckedChange={() => setBuyerFilter('')}
              >
                All Buyers
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {buyers.map((b) => (
                <DropdownMenuCheckboxItem
                  key={b}
                  checked={buyerFilter === b}
                  onCheckedChange={() => setBuyerFilter(b)}
                >
                  {b}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToExcel(rows)}
            disabled={rows.length === 0}
            className="h-9 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>

          {/* Active Filters + Count */}
          <div className="flex items-center gap-1 ml-auto">
            {activeFilterCount > 0 && (
              <>
                {companyFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setCompanyFilter('all')}>
                    {companyFilter} <X className="h-3 w-3 ml-1" />
                  </Badge>
                )}
                {buyerFilter && (
                  <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setBuyerFilter('')}>
                    {buyerFilter} <X className="h-3 w-3 ml-1" />
                  </Badge>
                )}
              </>
            )}

            {/* Sync Status */}
            {syncStatus && <SyncStatusBadge syncStatus={syncStatus} />}

            {/* Count */}
            <span className="text-xs text-gray-500 ml-2">
              {rows.length} items
            </span>
          </div>
        </div>
      </div>

      {/* WIP Table */}
      <div className="bg-white rounded-lg border">
        <WIPTable rows={rows} isLoading={isLoading} />
      </div>
    </div>
  )
}
