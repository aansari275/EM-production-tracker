import { useState, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUpdateItemTracker } from '@/hooks/useProductionTracker'
import type { ProductionRow } from '@/types'
import { formatDateShort, cn } from '@/lib/utils'
import { Package, Loader2 } from 'lucide-react'

interface ProductionTableProps {
  rows: ProductionRow[]
  isLoading: boolean
}

export function ProductionTable({ rows, isLoading }: ProductionTableProps) {
  const updateItem = useUpdateItemTracker()
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Handle cell edit start
  const startEdit = (rowKey: string, field: string, currentValue: string | number) => {
    setEditingCell(`${rowKey}-${field}`)
    setEditValue(String(currentValue || ''))
  }

  // Handle cell edit save
  const saveEdit = useCallback(async (
    orderId: string,
    itemId: string,
    field: string,
    value: string
  ) => {
    // Convert value based on field type
    let parsedValue: string | number = value
    if (['rcvdPcs', 'oldStock', 'bazarDone', 'uFinishing', 'packed'].includes(field)) {
      parsedValue = parseInt(value) || 0
    }

    try {
      await updateItem.mutateAsync({
        orderId,
        itemId,
        update: { [field]: parsedValue }
      })
    } catch (error) {
      console.error('Failed to save:', error)
    }

    setEditingCell(null)
    setEditValue('')
  }, [updateItem])

  // Handle key press in edit mode
  const handleKeyDown = (
    e: React.KeyboardEvent,
    orderId: string,
    itemId: string,
    field: string
  ) => {
    if (e.key === 'Enter') {
      saveEdit(orderId, itemId, field, editValue)
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Loading orders...</p>
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

  // Group rows by OPS for visual separation
  let lastOps = ''

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <Table className="text-xs">
        <TableHeader className="sticky top-0 bg-gray-100 z-10">
          <TableRow className="border-b-2">
            <TableHead className="w-16 font-bold text-center bg-gray-200">Handled</TableHead>
            <TableHead className="w-16 font-bold bg-gray-200">Buyer</TableHead>
            <TableHead className="w-24 font-bold bg-gray-200">Merchant</TableHead>
            <TableHead className="w-20 font-bold bg-gray-200">PO Date</TableHead>
            <TableHead className="w-20 font-bold bg-gray-200">Ex-Factory</TableHead>
            <TableHead className="w-24 font-bold bg-gray-200">OPS #</TableHead>
            <TableHead className="w-32 font-bold bg-gray-200">Article</TableHead>
            <TableHead className="w-20 font-bold bg-gray-200">Size</TableHead>
            <TableHead className="w-24 font-bold bg-gray-200">Color</TableHead>
            <TableHead className="w-24 font-bold bg-gray-200">Quality</TableHead>
            <TableHead className="w-16 font-bold text-right bg-gray-200">Order Pcs</TableHead>
            <TableHead className="w-48 font-bold bg-yellow-100">Status</TableHead>
            <TableHead className="w-16 font-bold text-right bg-green-100">Rcvd</TableHead>
            <TableHead className="w-16 font-bold text-right bg-orange-100">To Rcvd</TableHead>
            <TableHead className="w-16 font-bold text-right bg-purple-100">Finish</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const rowKey = `${row.orderId}-${row.itemId}`
            const isNewOps = row.opsNo !== lastOps
            lastOps = row.opsNo

            // Calculate toRcvd (Bazar Pending = Order Pcs - Bazar Done)
            const toRcvd = row.orderPcs - (row.bazarDone || 0)

            return (
              <TableRow
                key={rowKey}
                className={cn(
                  'hover:bg-muted/50',
                  isNewOps && index > 0 && 'border-t-2 border-gray-300'
                )}
              >
                {/* Handled (Company) */}
                <TableCell className="text-center font-medium">
                  <Badge
                    variant={row.companyCode === 'EMPL' ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {row.companyCode}
                  </Badge>
                </TableCell>

                {/* Buyer Code */}
                <TableCell className="font-medium">{row.customerCode}</TableCell>

                {/* Merchant */}
                <TableCell className="truncate max-w-[100px]" title={row.merchant}>
                  {row.merchant}
                </TableCell>

                {/* PO Date */}
                <TableCell>{formatDateShort(row.poDate)}</TableCell>

                {/* Ex-Factory */}
                <TableCell className={cn(
                  isOverdue(row.exFactoryDate) && 'text-red-600 font-medium'
                )}>
                  {formatDateShort(row.exFactoryDate)}
                </TableCell>

                {/* OPS # */}
                <TableCell className="font-mono font-medium">{row.opsNo}</TableCell>

                {/* Article */}
                <TableCell className="truncate max-w-[120px]" title={row.article}>
                  {row.article}
                </TableCell>

                {/* Size */}
                <TableCell>{row.size}</TableCell>

                {/* Color */}
                <TableCell className="truncate max-w-[100px]" title={row.color}>
                  {row.color}
                </TableCell>

                {/* Quality */}
                <TableCell className="truncate max-w-[100px]" title={row.quality}>
                  {row.quality}
                </TableCell>

                {/* Order Pcs */}
                <TableCell className="text-right font-medium">{row.orderPcs}</TableCell>

                {/* Status - Editable */}
                <TableCell className="bg-yellow-50">
                  {editingCell === `${rowKey}-status` ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveEdit(row.orderId, row.itemId, 'status', editValue)}
                      onKeyDown={(e) => handleKeyDown(e, row.orderId, row.itemId, 'status')}
                      className="h-6 text-xs"
                      autoFocus
                    />
                  ) : (
                    <div
                      className="cursor-pointer hover:bg-yellow-100 px-1 py-0.5 rounded min-h-[20px] truncate"
                      onClick={() => startEdit(rowKey, 'status', row.status)}
                      title={row.status || 'Click to add status'}
                    >
                      {row.status || <span className="text-muted-foreground">-</span>}
                    </div>
                  )}
                </TableCell>

                {/* Rcvd (Bazar Done) - Editable */}
                <TableCell className="text-right bg-green-50">
                  <EditableNumberCell
                    rowKey={rowKey}
                    field="bazarDone"
                    value={row.bazarDone}
                    editingCell={editingCell}
                    editValue={editValue}
                    startEdit={startEdit}
                    setEditValue={setEditValue}
                    saveEdit={() => saveEdit(row.orderId, row.itemId, 'bazarDone', editValue)}
                    handleKeyDown={(e) => handleKeyDown(e, row.orderId, row.itemId, 'bazarDone')}
                  />
                </TableCell>

                {/* To Rcvd (Bazar Pending) - from Excel or calculated */}
                <TableCell className={cn(
                  'text-right bg-orange-50 font-medium',
                  (row.toRcvdPcs || toRcvd) > 0 && 'text-orange-600'
                )}>
                  {row.toRcvdPcs || toRcvd}
                </TableCell>

                {/* Finish (U/Finishing) - Editable */}
                <TableCell className="text-right bg-purple-50">
                  <EditableNumberCell
                    rowKey={rowKey}
                    field="uFinishing"
                    value={row.uFinishing}
                    editingCell={editingCell}
                    editValue={editValue}
                    startEdit={startEdit}
                    setEditValue={setEditValue}
                    saveEdit={() => saveEdit(row.orderId, row.itemId, 'uFinishing', editValue)}
                    handleKeyDown={(e) => handleKeyDown(e, row.orderId, row.itemId, 'uFinishing')}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

// Helper component for editable number cells
function EditableNumberCell({
  rowKey,
  field,
  value,
  editingCell,
  editValue,
  startEdit,
  setEditValue,
  saveEdit,
  handleKeyDown,
}: {
  rowKey: string
  field: string
  value: number
  editingCell: string | null
  editValue: string
  startEdit: (key: string, field: string, value: number) => void
  setEditValue: (value: string) => void
  saveEdit: () => void
  handleKeyDown: (e: React.KeyboardEvent) => void
}) {
  const isEditing = editingCell === `${rowKey}-${field}`

  if (isEditing) {
    return (
      <Input
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={saveEdit}
        onKeyDown={handleKeyDown}
        className="h-6 text-xs text-right w-14"
        autoFocus
      />
    )
  }

  return (
    <div
      className="cursor-pointer hover:bg-white/50 px-1 py-0.5 rounded text-right"
      onClick={() => startEdit(rowKey, field, value)}
    >
      {value || 0}
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
