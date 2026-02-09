import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useWIP } from '@/hooks/useWIP'
import type { WIPRow, WIPSummary, WIPSyncStatus, WIPGroupedRow } from '@/types'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
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
  X,
  User,
  ChevronDown,
  ChevronRight,
  Download,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Filter,
  Eye,
  EyeOff,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ============================================================================
// Group rows by OPS number
// ============================================================================

function groupByOps(rows: WIPRow[]): WIPGroupedRow[] {
  const map = new Map<string, WIPGroupedRow>()

  for (const row of rows) {
    const key = `${row.company}-${row.opsNo}`
    const existing = map.get(key)

    if (existing) {
      existing.itemCount += 1
      existing.totalPcs += row.totalPcs
      existing.onLoom += row.onLoom
      existing.bazarPcs += row.bazarPcs
      existing.finishingPcs += row.finishingPcs
      existing.fgGodownPcs += row.fgGodownPcs
      existing.packedPcs += row.packedPcs
      existing.dispatchedPcs += row.dispatchedPcs
      existing.items.push(row)
    } else {
      map.set(key, {
        company: row.company,
        opsNo: row.opsNo,
        buyerCode: row.buyerCode,
        buyerName: row.buyerName || '',
        itemCount: 1,
        totalPcs: row.totalPcs,
        onLoom: row.onLoom,
        bazarPcs: row.bazarPcs,
        finishingPcs: row.finishingPcs,
        fgGodownPcs: row.fgGodownPcs,
        packedPcs: row.packedPcs,
        dispatchedPcs: row.dispatchedPcs,
        items: [row],
      })
    }
  }

  return Array.from(map.values())
}

// ============================================================================
// Open OPS filter — extract sequence number from OPS like "EM-25-1131"
// ============================================================================

function extractOpsSequence(opsNo: string): number | null {
  // Handle formats: EM-25-1131, EM-25-139 B, EM-25-770-B
  const match = opsNo.match(/EM-\d+-(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

async function fetchOpenOps(): Promise<{ opsNumbers: string[]; maxSequence: number } | null> {
  try {
    const res = await fetch('/api/production-status/file')
    if (!res.ok) return null
    const json = await res.json()
    if (!json.success || !json.data?.opsNumbers?.length) return null

    const opsNumbers: string[] = json.data.opsNumbers
    let maxSeq = 0
    for (const ops of opsNumbers) {
      const seq = extractOpsSequence(ops)
      if (seq && seq > maxSeq) maxSeq = seq
    }

    return { opsNumbers, maxSequence: maxSeq }
  } catch {
    return null
  }
}

function filterOpenOps(
  groups: WIPGroupedRow[],
  openOps: { opsNumbers: string[]; maxSequence: number }
): WIPGroupedRow[] {
  const openSet = new Set(openOps.opsNumbers.map(o => o.toLowerCase().trim()))

  return groups.filter(group => {
    const opsLower = group.opsNo.toLowerCase().trim()

    // 1. Exact match in Excel OPS list
    if (openSet.has(opsLower)) return true

    // 2. Newer OPS (sequence > maxSequence) — future orders not in old Excel
    const seq = extractOpsSequence(group.opsNo)
    if (seq && seq > openOps.maxSequence) return true

    return false
  })
}

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
// Grouped Stage Progress Bar (for aggregated OPS row)
// ============================================================================

function GroupedStageBar({ group }: { group: WIPGroupedRow }) {
  const total = group.totalPcs || 1
  const segments = [
    { label: 'Loom', count: group.onLoom, color: 'bg-amber-400' },
    { label: 'Bazar', count: group.bazarPcs, color: 'bg-green-400' },
    { label: 'Finish', count: group.finishingPcs, color: 'bg-orange-400' },
    { label: 'FG', count: group.fgGodownPcs, color: 'bg-blue-400' },
    { label: 'Pack', count: group.packedPcs, color: 'bg-teal-400' },
    { label: 'Ship', count: group.dispatchedPcs, color: 'bg-gray-400' },
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
// Item-level mini progress bar (for detail dialog)
// ============================================================================

function ItemStageBar({ row }: { row: WIPRow }) {
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
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
      {segments.map((seg) =>
        seg.count > 0 ? (
          <div
            key={seg.label}
            className={`${seg.color} h-full`}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ) : null
      )}
      {untracked > 0 && (
        <div className="bg-gray-200 h-full" style={{ width: `${(untracked / total) * 100}%` }} />
      )}
    </div>
  )
}

// ============================================================================
// Detail Dialog — shows line items for a grouped OPS
// ============================================================================

function OpsDetailDialog({
  group,
  open,
  onOpenChange,
}: {
  group: WIPGroupedRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!group) return null

  const stages = [
    { label: 'On Loom', count: group.onLoom, color: 'amber' },
    { label: 'Bazar', count: group.bazarPcs, color: 'green' },
    { label: 'Finishing', count: group.finishingPcs, color: 'orange' },
    { label: 'FG Godown', count: group.fgGodownPcs, color: 'blue' },
    { label: 'Packed', count: group.packedPcs, color: 'teal' },
    { label: 'Dispatched', count: group.dispatchedPcs, color: 'gray' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-lg">{group.opsNo}</span>
            <CompanyBadge company={group.company} />
            <span className="text-gray-500 font-normal text-sm">
              {group.buyerCode}{group.buyerName ? ` - ${group.buyerName}` : ''}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Line item details for OPS {group.opsNo}
          </DialogDescription>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 pb-2">
          <Badge variant="outline" className="text-xs font-bold">
            {group.itemCount} item{group.itemCount > 1 ? 's' : ''} &middot; {group.totalPcs} pcs
          </Badge>
          {stages.map((s) =>
            s.count > 0 ? (
              <Badge
                key={s.label}
                variant="outline"
                className={`text-xs text-${s.color}-700 border-${s.color}-200 bg-${s.color}-50`}
              >
                {s.label}: {s.count}
              </Badge>
            ) : null
          )}
        </div>

        {/* Line items table */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Design</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Size</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Color</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quality</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-amber-600">Loom</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-green-600">Bazar</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-orange-600">Finish</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-blue-600">FG</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-teal-600">Packed</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Ship</th>
                <th className="px-2 py-2 text-xs font-medium text-gray-500 min-w-[80px]">Progress</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item, idx) => (
                <tr key={`${item.orderItemId || idx}`} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-xs text-gray-800 max-w-[160px] truncate" title={item.design}>
                    {item.design || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{item.size || '-'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[100px] truncate" title={item.color}>
                    {item.color || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[100px] truncate" title={item.quality}>
                    {item.quality || '-'}
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-gray-800 text-right">{item.totalPcs}</td>
                  <td className="px-2 py-2 text-xs font-bold text-right">
                    <span className={item.onLoom > 0 ? 'text-amber-600' : 'text-gray-300'}>{item.onLoom || '-'}</span>
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right">
                    <span className={item.bazarPcs > 0 ? 'text-green-600' : 'text-gray-300'}>{item.bazarPcs || '-'}</span>
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right">
                    <span className={item.finishingPcs > 0 ? 'text-orange-600' : 'text-gray-300'}>{item.finishingPcs || '-'}</span>
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right">
                    <span className={item.fgGodownPcs > 0 ? 'text-blue-600' : 'text-gray-300'}>{item.fgGodownPcs || '-'}</span>
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right">
                    <span className={item.packedPcs > 0 ? 'text-teal-600' : 'text-gray-300'}>{item.packedPcs || '-'}</span>
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right">
                    <span className={item.dispatchedPcs > 0 ? 'text-gray-700' : 'text-gray-300'}>{item.dispatchedPcs || '-'}</span>
                  </td>
                  <td className="px-2 py-2">
                    <ItemStageBar row={item} />
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            {group.items.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td colSpan={4} className="px-3 py-2 text-xs text-gray-600">Total ({group.items.length} items)</td>
                  <td className="px-2 py-2 text-xs text-gray-800 text-right">{group.totalPcs}</td>
                  <td className="px-2 py-2 text-xs text-amber-600 text-right">{group.onLoom || '-'}</td>
                  <td className="px-2 py-2 text-xs text-green-600 text-right">{group.bazarPcs || '-'}</td>
                  <td className="px-2 py-2 text-xs text-orange-600 text-right">{group.finishingPcs || '-'}</td>
                  <td className="px-2 py-2 text-xs text-blue-600 text-right">{group.fgGodownPcs || '-'}</td>
                  <td className="px-2 py-2 text-xs text-teal-600 text-right">{group.packedPcs || '-'}</td>
                  <td className="px-2 py-2 text-xs text-gray-700 text-right">{group.dispatchedPcs || '-'}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Folio/Contractor info if available */}
        {group.items.some(i => i.folioNo || i.contractor) && (
          <div className="mt-2 text-xs text-gray-400 space-y-0.5">
            {group.items.filter(i => i.folioNo || i.contractor).map((item, idx) => (
              <div key={idx}>
                {item.design && <span className="text-gray-500">{item.design}: </span>}
                {item.folioNo && `Folio ${item.folioNo}`}
                {item.folioNo && item.contractor && ' | '}
                {item.contractor && `Contractor: ${item.contractor}`}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Grouped WIP Table — one row per OPS
// ============================================================================

type SortKey = 'opsNo' | 'buyerCode' | 'totalPcs' | 'itemCount' | 'bazarPcs' | 'packedPcs'
type SortDir = 'asc' | 'desc'

function WIPTable({
  groups,
  isLoading,
  onRowClick,
}: {
  groups: WIPGroupedRow[]
  isLoading: boolean
  onRowClick: (group: WIPGroupedRow) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('opsNo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'opsNo':
          cmp = a.opsNo.localeCompare(b.opsNo)
          break
        case 'buyerCode':
          cmp = a.buyerCode.localeCompare(b.buyerCode)
          break
        case 'totalPcs':
          cmp = a.totalPcs - b.totalPcs
          break
        case 'itemCount':
          cmp = a.itemCount - b.itemCount
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
  }, [groups, sortKey, sortDir])

  const SortHeader = ({ label, field, className = '' }: { label: string; field: SortKey; className?: string }) => (
    <th
      className={`px-2 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field && (
          <span className="text-green-600">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
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

  if (groups.length === 0) {
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
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-12">Co.</th>
            <SortHeader label="OPS #" field="opsNo" className="w-28" />
            <SortHeader label="Buyer" field="buyerCode" className="w-16" />
            <SortHeader label="Items" field="itemCount" className="w-14 text-center" />
            <SortHeader label="Total" field="totalPcs" className="w-16 text-right" />
            <th className="px-2 py-2 text-left text-xs font-medium text-amber-600 w-14">Loom</th>
            <SortHeader label="Bazar" field="bazarPcs" className="w-14" />
            <th className="px-2 py-2 text-left text-xs font-medium text-orange-600 w-14">Finish</th>
            <SortHeader label="Packed" field="packedPcs" className="w-14" />
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 min-w-[140px]">Progress</th>
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map((group) => (
            <tr
              key={`${group.company}-${group.opsNo}`}
              className="border-t border-gray-100 hover:bg-green-50/50 cursor-pointer transition-colors"
              onClick={() => onRowClick(group)}
            >
              <td className="px-2 py-2.5">
                <CompanyBadge company={group.company} />
              </td>
              <td className="px-2 py-2.5 font-mono text-xs font-bold text-gray-800">
                {group.opsNo}
              </td>
              <td className="px-2 py-2.5 text-xs font-medium text-gray-700">
                {group.buyerCode}
              </td>
              <td className="px-2 py-2.5 text-center">
                <span className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600">
                  {group.itemCount}
                </span>
              </td>
              <td className="px-2 py-2.5 text-xs font-bold text-gray-800 text-right">
                {group.totalPcs}
              </td>
              <td className="px-2 py-2.5">
                <span className={`text-xs font-bold ${group.onLoom > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                  {group.onLoom || '-'}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <span className={`text-xs font-bold ${group.bazarPcs > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                  {group.bazarPcs || '-'}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <span className={`text-xs font-bold ${group.finishingPcs > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                  {group.finishingPcs || '-'}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <span className={`text-xs font-bold ${group.packedPcs > 0 ? 'text-teal-600' : 'text-gray-300'}`}>
                  {group.packedPcs || '-'}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <GroupedStageBar group={group} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Export to Excel (line-item level for full detail)
// ============================================================================

function exportToExcel(rows: WIPRow[]) {
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
  const [selectedGroup, setSelectedGroup] = useState<WIPGroupedRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'open' | 'all'>('open')

  // Fetch open OPS list from Firestore (via API)
  const { data: openOpsData } = useQuery({
    queryKey: ['wip-open-ops'],
    queryFn: fetchOpenOps,
    staleTime: 30 * 60 * 1000, // 30 min — rarely changes
    refetchOnWindowFocus: false,
  })

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

  // Group rows by OPS
  const allGroupedRows = useMemo(() => groupByOps(rows), [rows])

  // Apply open/all filter
  const groupedRows = useMemo(() => {
    if (viewMode === 'all' || !openOpsData) return allGroupedRows
    return filterOpenOps(allGroupedRows, openOpsData)
  }, [allGroupedRows, viewMode, openOpsData])

  // Count of filtered-out (dispatched) orders
  const dispatchedCount = allGroupedRows.length - (openOpsData ? filterOpenOps(allGroupedRows, openOpsData).length : 0)

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
    (buyerFilter ? 1 : 0) +
    (viewMode === 'all' ? 1 : 0)

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wip'] })
  }

  const handleRowClick = (group: WIPGroupedRow) => {
    setSelectedGroup(group)
    setDialogOpen(true)
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

          {/* Open / All Toggle */}
          {openOpsData && (
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('open')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                  viewMode === 'open'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Eye className="h-3 w-3" />
                Open
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                  viewMode === 'all'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Filter className="h-3 w-3" />
                All {dispatchedCount > 0 && `(+${dispatchedCount})`}
              </button>
            </div>
          )}

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

          {/* Export (still line-item level) */}
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
              {groupedRows.length} orders &middot; {rows.length} items
            </span>
          </div>
        </div>
      </div>

      {/* Grouped WIP Table */}
      <div className="bg-white rounded-lg border">
        <WIPTable
          groups={groupedRows}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Detail Dialog */}
      <OpsDetailDialog
        group={selectedGroup}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
